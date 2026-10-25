"""ArchitectIQ Document AI Lifecycle Router (Milestone M9).

Delivers:
- DOC-01: Document ingestion, OCR simulation, schema classification, segmentation, extraction.
- DOC-02: Human-in-the-loop annotation queue, field corrections, and validation signoff.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from models import Document, DocumentAnnotation, DocumentSchema, Project
from project_rbac import require_project_capability

logger = logging.getLogger("architectiq.document_ai")

router = APIRouter(tags=["Document AI"])


# ---------------------------------------------------------
# Schemas
# ---------------------------------------------------------

class DocumentSchemaCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    fields_schema: list[dict[str, Any]] = Field(default_factory=list)
    confidence_threshold: float = Field(0.85, ge=0.0, le=1.0)
    status: str = Field("ACTIVE")


class DocumentSchemaResponse(BaseModel):
    id: str
    tenant_id: str
    project_id: str
    name: str
    slug: str
    description: Optional[str]
    fields_schema: list[dict[str, Any]]
    confidence_threshold: float
    status: str
    created_at: str
    updated_at: str


class DocumentUploadIn(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field("application/pdf", max_length=100)
    file_size_bytes: int = Field(0, ge=0)
    storage_path: str = Field(..., min_length=1, max_length=500)
    schema_id: Optional[uuid.UUID] = None
    raw_text: Optional[str] = None
    page_count: int = Field(1, ge=1)


class DocumentOut(BaseModel):
    id: str
    tenant_id: str
    project_id: str
    schema_id: Optional[str]
    file_name: str
    mime_type: str
    file_size_bytes: int
    storage_path: str
    status: str
    classification: Optional[str]
    page_count: int
    raw_text: Optional[str]
    extracted_entities: dict[str, Any]
    overall_confidence: float
    created_at: str
    updated_at: str


class DocumentExtractIn(BaseModel):
    ocr_engine: str = Field("TESSERACT_OCR")
    force_schema_id: Optional[uuid.UUID] = None


class AnnotationResolveIn(BaseModel):
    decision: Literal["ACCEPTED", "CORRECTED", "REJECTED"]
    corrected_value: Optional[str] = None


class AnnotationOut(BaseModel):
    id: str
    tenant_id: str
    document_id: str
    field_name: str
    extracted_value: Optional[str]
    corrected_value: Optional[str]
    is_corrected: bool
    status: str
    annotated_by: Optional[str]
    annotated_at: Optional[str]
    created_at: str


# ---------------------------------------------------------
# Document Schema Endpoints
# ---------------------------------------------------------

@router.get("/projects/{project_id}/document-schemas")
def list_document_schemas(
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> list[DocumentSchemaResponse]:
    actor_id = getattr(request.state, "verified_actor_id", None)
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    schemas = db.query(DocumentSchema).filter(
        DocumentSchema.tenant_id == tenant_id,
        DocumentSchema.project_id == project_id,
    ).order_by(DocumentSchema.created_at.desc()).all()

    return [
        DocumentSchemaResponse(
            id=str(s.id),
            tenant_id=str(s.tenant_id),
            project_id=str(s.project_id),
            name=s.name,
            slug=s.slug,
            description=s.description,
            fields_schema=s.fields_schema,
            confidence_threshold=float(s.confidence_threshold),
            status=s.status,
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )
        for s in schemas
    ]


@router.post("/projects/{project_id}/document-schemas", status_code=status.HTTP_201_CREATED)
def create_document_schema(
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    body: DocumentSchemaCreate,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> DocumentSchemaResponse:
    actor_id = getattr(request.state, "verified_actor_id", None)
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    existing = db.query(DocumentSchema).filter(
        DocumentSchema.tenant_id == tenant_id,
        DocumentSchema.project_id == project_id,
        DocumentSchema.slug == body.slug,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Schema with slug '{body.slug}' already exists in this project")

    schema = DocumentSchema(
        tenant_id=tenant_id,
        project_id=project_id,
        name=body.name,
        slug=body.slug,
        description=body.description,
        fields_schema=body.fields_schema,
        confidence_threshold=body.confidence_threshold,
        status=body.status,
    )
    db.add(schema)
    db.flush()

    return DocumentSchemaResponse(
        id=str(schema.id),
        tenant_id=str(schema.tenant_id),
        project_id=str(schema.project_id),
        name=schema.name,
        slug=schema.slug,
        description=schema.description,
        fields_schema=schema.fields_schema,
        confidence_threshold=float(schema.confidence_threshold),
        status=schema.status,
        created_at=schema.created_at.isoformat(),
        updated_at=schema.updated_at.isoformat(),
    )


# ---------------------------------------------------------
# Document Ingestion & Extraction Pipeline
# ---------------------------------------------------------

@router.post("/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
def upload_document(
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    body: DocumentUploadIn,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> DocumentOut:
    actor_id = getattr(request.state, "verified_actor_id", None)
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    # Ingest document record
    doc = Document(
        tenant_id=tenant_id,
        project_id=project_id,
        schema_id=body.schema_id,
        file_name=body.file_name,
        mime_type=body.mime_type,
        file_size_bytes=body.file_size_bytes,
        storage_path=body.storage_path,
        status="UPLOADED",
        page_count=body.page_count,
        raw_text=body.raw_text or f"Sample document payload for {body.file_name}",
        extracted_entities={},
        overall_confidence=0.0,
    )
    db.add(doc)
    db.flush()

    return DocumentOut(
        id=str(doc.id),
        tenant_id=str(doc.tenant_id),
        project_id=str(doc.project_id),
        schema_id=str(doc.schema_id) if doc.schema_id else None,
        file_name=doc.file_name,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        storage_path=doc.storage_path,
        status=doc.status,
        classification=doc.classification,
        page_count=doc.page_count,
        raw_text=doc.raw_text,
        extracted_entities=doc.extracted_entities,
        overall_confidence=float(doc.overall_confidence),
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@router.get("/projects/{project_id}/documents")
def list_documents(
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    request: Request,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_authorized_tenant_db),
) -> list[DocumentOut]:
    actor_id = getattr(request.state, "verified_actor_id", None)
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    query = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.project_id == project_id,
    )
    if status_filter and status_filter != "ALL":
        query = query.filter(Document.status == status_filter)

    docs = query.order_by(Document.created_at.desc()).all()

    return [
        DocumentOut(
            id=str(d.id),
            tenant_id=str(d.tenant_id),
            project_id=str(d.project_id),
            schema_id=str(d.schema_id) if d.schema_id else None,
            file_name=d.file_name,
            mime_type=d.mime_type,
            file_size_bytes=d.file_size_bytes,
            storage_path=d.storage_path,
            status=d.status,
            classification=d.classification,
            page_count=d.page_count,
            raw_text=d.raw_text,
            extracted_entities=d.extracted_entities,
            overall_confidence=float(d.overall_confidence),
            created_at=d.created_at.isoformat(),
            updated_at=d.updated_at.isoformat(),
        )
        for d in docs
    ]


@router.get("/documents/{document_id}")
def get_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> DocumentOut:
    actor_id = getattr(request.state, "verified_actor_id", None)

    doc = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.id == document_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    require_project_capability(db, doc.project_id, actor_id, tenant_id, "can_view")

    return DocumentOut(
        id=str(doc.id),
        tenant_id=str(doc.tenant_id),
        project_id=str(doc.project_id),
        schema_id=str(doc.schema_id) if doc.schema_id else None,
        file_name=doc.file_name,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        storage_path=doc.storage_path,
        status=doc.status,
        classification=doc.classification,
        page_count=doc.page_count,
        raw_text=doc.raw_text,
        extracted_entities=doc.extracted_entities,
        overall_confidence=float(doc.overall_confidence),
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


def perform_entity_extraction(text_content: str, fields: list[dict[str, Any]]) -> tuple[dict[str, Any], float]:
    """Perform regex & heuristic information extraction for schema fields."""
    extracted = {}
    confidences = []

    text_lower = text_content.lower()

    for field in fields:
        fname = field.get("name", "unknown")
        ftype = field.get("type", "string")

        val = None
        conf = 0.50

        if ftype == "currency" or "amount" in fname.lower() or "total" in fname.lower():
            # Search for currency patterns ($12,345.67 or USD 500)
            match = re.search(r"(\$|usd\s*)\s*([\d,]+\.?\d*)", text_content, re.IGNORECASE)
            if match:
                val = match.group(0).strip()
                conf = 0.95
            else:
                val = "$0.00"
                conf = 0.40
        elif ftype == "date" or "date" in fname.lower():
            # Search for dates (YYYY-MM-DD or MM/DD/YYYY)
            match = re.search(r"\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b", text_content)
            if match:
                val = match.group(0)
                conf = 0.92
            else:
                val = datetime.now(UTC).strftime("%Y-%m-%d")
                conf = 0.45
        elif "invoice" in fname.lower() or "number" in fname.lower() or "id" in fname.lower():
            match = re.search(r"\b(INV[-#]?\d+|\d{6,10})\b", text_content, re.IGNORECASE)
            if match:
                val = match.group(0)
                conf = 0.90
            else:
                val = "INV-00000"
                conf = 0.50
        elif "vendor" in fname.lower() or "company" in fname.lower():
            match = re.search(r"(?:vendor|company|billed to|from):\s*([a-zA-Z0-9\s.,]+)", text_content, re.IGNORECASE)
            if match:
                val = match.group(1).strip().split("\n")[0]
                conf = 0.88
            else:
                val = "Acme Corp"
                conf = 0.55
        else:
            # Generic field fallback
            val = f"Extracted {fname}"
            conf = 0.75

        extracted[fname] = {
            "value": val,
            "confidence": conf,
            "type": ftype,
        }
        confidences.append(conf)

    avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.80
    return extracted, avg_conf


@router.post("/documents/{document_id}/extract")
def extract_document(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    body: DocumentExtractIn,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> DocumentOut:
    actor_id = getattr(request.state, "verified_actor_id", None)

    doc = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.id == document_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    require_project_capability(db, doc.project_id, actor_id, tenant_id, "can_edit")

    # Locate schema
    target_schema_id = body.force_schema_id or doc.schema_id
    schema = None
    if target_schema_id:
        schema = db.query(DocumentSchema).filter(
            DocumentSchema.tenant_id == tenant_id,
            DocumentSchema.id == target_schema_id,
        ).first()

    # Default fields schema if none bound
    fields = schema.fields_schema if schema else [
        {"name": "vendor_name", "type": "string"},
        {"name": "invoice_number", "type": "string"},
        {"name": "total_amount", "type": "currency"},
        {"name": "invoice_date", "type": "date"},
    ]
    threshold = float(schema.confidence_threshold) if schema else 0.85

    # Run extraction
    extracted, overall_conf = perform_entity_extraction(doc.raw_text or "", fields)
    doc.extracted_entities = extracted
    doc.overall_confidence = overall_conf
    doc.classification = schema.name if schema else "Invoice / Procurement Document"
    doc.updated_at = datetime.now(UTC)

    # Route based on confidence threshold
    if overall_conf < threshold:
        doc.status = "REVIEW_REQUIRED"
        # Generate annotation tasks for low confidence fields
        for field_name, entity in extracted.items():
            if entity["confidence"] < threshold:
                ann = DocumentAnnotation(
                    tenant_id=tenant_id,
                    document_id=doc.id,
                    field_name=field_name,
                    extracted_value=str(entity["value"]),
                    corrected_value=None,
                    is_corrected=False,
                    status="PENDING",
                )
                db.add(ann)
    else:
        doc.status = "COMPLETED"

    db.flush()

    return DocumentOut(
        id=str(doc.id),
        tenant_id=str(doc.tenant_id),
        project_id=str(doc.project_id),
        schema_id=str(doc.schema_id) if doc.schema_id else None,
        file_name=doc.file_name,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        storage_path=doc.storage_path,
        status=doc.status,
        classification=doc.classification,
        page_count=doc.page_count,
        raw_text=doc.raw_text,
        extracted_entities=doc.extracted_entities,
        overall_confidence=float(doc.overall_confidence),
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


# ---------------------------------------------------------
# Human Annotation & Signoff Console (DOC-02)
# ---------------------------------------------------------

@router.get("/documents/{document_id}/annotations")
def list_document_annotations(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> list[AnnotationOut]:
    actor_id = getattr(request.state, "verified_actor_id", None)

    doc = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.id == document_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    require_project_capability(db, doc.project_id, actor_id, tenant_id, "can_view")

    annotations = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.tenant_id == tenant_id,
        DocumentAnnotation.document_id == document_id,
    ).order_by(DocumentAnnotation.created_at.asc()).all()

    return [
        AnnotationOut(
            id=str(a.id),
            tenant_id=str(a.tenant_id),
            document_id=str(a.document_id),
            field_name=a.field_name,
            extracted_value=a.extracted_value,
            corrected_value=a.corrected_value,
            is_corrected=a.is_corrected,
            status=a.status,
            annotated_by=str(a.annotated_by) if a.annotated_by else None,
            annotated_at=a.annotated_at.isoformat() if a.annotated_at else None,
            created_at=a.created_at.isoformat(),
        )
        for a in annotations
    ]


@router.post("/documents/{document_id}/annotations/{annotation_id}/resolve")
def resolve_annotation(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    annotation_id: uuid.UUID,
    body: AnnotationResolveIn,
    request: Request,
    db: Session = Depends(get_authorized_tenant_db),
) -> AnnotationOut:
    actor_id = getattr(request.state, "verified_actor_id", None)

    doc = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.id == document_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    require_project_capability(db, doc.project_id, actor_id, tenant_id, "can_edit")

    ann = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.tenant_id == tenant_id,
        DocumentAnnotation.document_id == document_id,
        DocumentAnnotation.id == annotation_id,
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")

    now = datetime.now(UTC)
    ann.status = body.decision
    ann.annotated_by = actor_id
    ann.annotated_at = now

    if body.decision == "CORRECTED" and body.corrected_value:
        ann.corrected_value = body.corrected_value
        ann.is_corrected = True

        # Update entity in document
        entities = dict(doc.extracted_entities)
        if ann.field_name in entities:
            entities[ann.field_name]["value"] = body.corrected_value
            entities[ann.field_name]["confidence"] = 1.0
            doc.extracted_entities = entities

    db.flush()

    # Check if any pending annotations remain for this document
    remaining_pending = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.tenant_id == tenant_id,
        DocumentAnnotation.document_id == document_id,
        DocumentAnnotation.status == "PENDING",
    ).count()

    if remaining_pending == 0:
        doc.status = "COMPLETED"
        doc.updated_at = now
        db.flush()

    return AnnotationOut(
        id=str(ann.id),
        tenant_id=str(ann.tenant_id),
        document_id=str(ann.document_id),
        field_name=ann.field_name,
        extracted_value=ann.extracted_value,
        corrected_value=ann.corrected_value,
        is_corrected=ann.is_corrected,
        status=ann.status,
        annotated_by=str(ann.annotated_by) if ann.annotated_by else None,
        annotated_at=ann.annotated_at.isoformat() if ann.annotated_at else None,
        created_at=ann.created_at.isoformat(),
    )

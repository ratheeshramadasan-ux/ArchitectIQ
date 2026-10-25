"""Comprehensive automated tests for Document AI Lifecycle (Milestone M9).

Covers:
- DOC-01: Document schemas, file ingestion, classification, and OCR extraction.
- DOC-02: Confidence threshold routing, human annotation queue, entity correction, and review signoff.
"""
from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import engine
from main import app

client = TestClient(app)


def authenticate_as(user_id: uuid.UUID):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def document_ai_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    other_org_id = uuid.uuid4()
    other_folder_id = uuid.uuid4()

    suffix = uuid.uuid4().hex[:6]

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'DocAI Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"doc-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Doc Specialist', 'ACTIVE', clock_timestamp())"),
            {"u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Other User', 'ACTIVE', clock_timestamp())"),
            {"u": other_user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": owner_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": other_user_id, "t": other_tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Doc Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"doc-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Other Org', :slug, clock_timestamp())"),
            {"o": other_org_id, "t": other_tenant_id, "slug": f"other-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Doc Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Other Folder', clock_timestamp())"),
            {"f": other_folder_id, "o": other_org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Doc Processing Hub', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Other Project', 'ACTIVE', clock_timestamp())"),
            {"p": other_project_id, "f": other_folder_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": other_tenant_id, "p": other_project_id, "u": other_user_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "project_id": str(project_id),
        "owner_id": owner_id,
        "other_tenant_id": str(other_tenant_id),
        "other_project_id": str(other_project_id),
        "other_user_id": other_user_id,
    }


def test_create_and_list_document_schemas(document_ai_env):
    env = document_ai_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # 1. Create Schema
    schema_payload = {
        "name": "Standard Accounts Payable Invoice",
        "slug": "ap-invoice-schema",
        "description": "Standard schema for AP invoices with vendor, total, and invoice number",
        "fields_schema": [
            {"name": "vendor_name", "type": "string"},
            {"name": "invoice_number", "type": "string"},
            {"name": "total_amount", "type": "currency"},
            {"name": "invoice_date", "type": "date"},
        ],
        "confidence_threshold": 0.80,
        "status": "ACTIVE",
    }
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/document-schemas",
        json=schema_payload,
        headers=headers,
    )
    assert res.status_code == 201, res.text
    schema_data = res.json()
    assert schema_data["slug"] == "ap-invoice-schema"
    assert len(schema_data["fields_schema"]) == 4
    schema_id = schema_data["id"]

    # 2. List Schemas
    list_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/document-schemas",
        headers=headers,
    )
    assert list_res.status_code == 200
    schemas = list_res.json()
    assert len(schemas) == 1
    assert schemas[0]["id"] == schema_id


def test_document_ingestion_and_extraction_completed(document_ai_env):
    env = document_ai_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Ingest clear document
    upload_payload = {
        "file_name": "Invoice_Acme_202610.pdf",
        "mime_type": "application/pdf",
        "file_size_bytes": 1048576,
        "storage_path": "s3://architectiq-docs/tenant-1/inv-202610.pdf",
        "raw_text": (
            "TAX INVOICE\n"
            "Billed to: Acme Systems International\n"
            "Invoice number: INV-984210\n"
            "Invoice date: 2026-10-25\n"
            "Description: Enterprise Software Licenses\n"
            "Total Amount: $14,500.00 USD\n"
        ),
        "page_count": 2,
    }
    upload_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/documents",
        json=upload_payload,
        headers=headers,
    )
    assert upload_res.status_code == 201, upload_res.text
    doc = upload_res.json()
    assert doc["status"] == "UPLOADED"
    doc_id = doc["id"]

    # Run Extraction
    extract_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/extract",
        json={"ocr_engine": "TESSERACT_OCR"},
        headers=headers,
    )
    assert extract_res.status_code == 200, extract_res.text
    extracted_doc = extract_res.json()
    assert extracted_doc["status"] == "COMPLETED"
    assert extracted_doc["overall_confidence"] >= 0.85
    entities = extracted_doc["extracted_entities"]
    assert "Acme Systems" in entities["vendor_name"]["value"]
    assert "INV-984210" in entities["invoice_number"]["value"]
    assert "$14,500.00" in entities["total_amount"]["value"]


def test_document_extraction_low_confidence_generates_annotations(document_ai_env):
    env = document_ai_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Create schema with high threshold
    schema_payload = {
        "name": "Strict Procurement Contract",
        "slug": "strict-procurement",
        "fields_schema": [
            {"name": "vendor_name", "type": "string"},
            {"name": "total_amount", "type": "currency"},
        ],
        "confidence_threshold": 0.90,
    }
    s_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/document-schemas",
        json=schema_payload,
        headers=headers,
    )
    assert s_res.status_code == 201
    schema_id = s_res.json()["id"]

    # Ingest document with ambiguous text
    upload_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/documents",
        json={
            "file_name": "Receipt_Smudged_Scan.png",
            "mime_type": "image/png",
            "storage_path": "s3://architectiq-docs/receipt.png",
            "raw_text": "Unclear handwritten notes: Coffee & supplies approx 45 bucks",
            "schema_id": schema_id,
        },
        headers=headers,
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # Extract
    extract_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/extract",
        json={},
        headers=headers,
    )
    assert extract_res.status_code == 200
    doc = extract_res.json()
    assert doc["status"] == "REVIEW_REQUIRED"

    # Verify annotations queue populated
    ann_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/annotations",
        headers=headers,
    )
    assert ann_res.status_code == 200
    annotations = ann_res.json()
    assert len(annotations) >= 1
    assert annotations[0]["status"] == "PENDING"


def test_resolve_human_annotation_completes_document(document_ai_env):
    env = document_ai_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Ingest & extract ambiguous doc
    upload_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/documents",
        json={
            "file_name": "Scanned_Invoice.pdf",
            "mime_type": "application/pdf",
            "storage_path": "s3://docs/scan.pdf",
            "raw_text": "Bill: Missing formal tags",
        },
        headers=headers,
    )
    doc_id = upload_res.json()["id"]

    client.post(f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/extract", json={}, headers=headers)

    # Get pending annotations
    ann_res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/annotations", headers=headers)
    annotations = ann_res.json()
    assert len(annotations) > 0

    # Resolve each annotation
    for ann in annotations:
        resolve_res = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}/annotations/{ann['id']}/resolve",
            json={"decision": "CORRECTED", "corrected_value": "Verified Human Value"},
            headers=headers,
        )
        assert resolve_res.status_code == 200
        assert resolve_res.json()["status"] == "CORRECTED"
        assert resolve_res.json()["is_corrected"] is True

    # After resolving all annotations, verify document status transitioned to COMPLETED
    doc_res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/documents/{doc_id}", headers=headers)
    assert doc_res.status_code == 200
    assert doc_res.json()["status"] == "COMPLETED"


def test_document_ai_cross_tenant_isolation(document_ai_env):
    env = document_ai_env
    tenant_1 = env["tenant_id"]
    proj_1 = env["project_id"]
    tenant_2 = env["other_tenant_id"]

    authenticate_as(env["owner_id"])
    headers_1 = {"Authorization": "Bearer test-token"}

    # Create document in Tenant 1
    upload_res = client.post(
        f"/api/v1/tenants/{tenant_1}/workspace/projects/{proj_1}/documents",
        json={
            "file_name": "Tenant1_Confidential_Contract.pdf",
            "mime_type": "application/pdf",
            "storage_path": "s3://tenant1/contract.pdf",
            "raw_text": "CONFIDENTIAL AGREEMENT",
        },
        headers=headers_1,
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # Switch to User in Tenant 2
    authenticate_as(env["other_user_id"])
    headers_2 = {"Authorization": "Bearer test-token"}

    # Tenant 2 cannot access Tenant 1 document
    get_res = client.get(
        f"/api/v1/tenants/{tenant_2}/workspace/documents/{doc_id}",
        headers=headers_2,
    )
    assert get_res.status_code == 404

    # Tenant 2 cannot extract Tenant 1 document
    extract_res = client.post(
        f"/api/v1/tenants/{tenant_2}/workspace/documents/{doc_id}/extract",
        json={},
        headers=headers_2,
    )
    assert extract_res.status_code == 404

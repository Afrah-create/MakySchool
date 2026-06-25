from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.db.pool import get_db
from app.lib.pdf import (
    InvoiceNotFoundError,
    OtherIncomeNotFoundError,
    generate_invoice_pdf,
    generate_other_income_receipt_pdf,
)
from app.middleware.tenant import get_tenant_and_user
from app.routers.fees_shared import (
    PAYMENT_METHODS,
    fees_actor_id,
    fees_error as _error,
    recalculate_fee_account as _recalculate_fee_account,
    require_fees_permission as _require_permission,
)
from app.services.fees import budget as budget_service
from app.services.fees import chart_accounts as coa_service
from app.services.fees import income_sources as sources_service
from app.services.fees import invoices as invoice_service
from app.services.fees import other_income as other_income_service

router = APIRouter()


class ChartAccountCreate(BaseModel):
    code: str
    name: str
    account_type: str
    category: str | None = None
    description: str | None = None


class ChartAccountPatch(BaseModel):
    code: str | None = None
    name: str | None = None
    category: str | None = None
    description: str | None = None
    is_active: bool | None = None


class IncomeSourceCreate(BaseModel):
    name: str
    category: str | None = None
    description: str | None = None


class IncomeSourcePatch(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    is_active: bool | None = None


class OtherIncomeItemInput(BaseModel):
    description: str
    account_id: str | None = None
    amount: int


class OtherIncomeCreate(BaseModel):
    source_id: str | None = None
    account_id: str | None = None
    description: str
    income_date: str
    payment_method: str = "cash"
    payment_reference: str | None = None
    notes: str | None = None
    items: list[OtherIncomeItemInput]


class VoidBody(BaseModel):
    reason: str


class InvoiceItemInput(BaseModel):
    description: str
    account_id: str | None = None
    quantity: int = 1
    unit_amount: int


class InvoiceCreate(BaseModel):
    student_id: str
    fee_structure_id: str | None = None
    due_date: str | None = None
    term_name: str
    academic_year: int
    notes: str | None = None
    items: list[InvoiceItemInput]


class InvoiceBulkCreate(BaseModel):
    student_ids: list[str]
    fee_structure_id: str | None = None
    due_date: str | None = None
    term_name: str
    academic_year: int
    notes: str | None = None
    items: list[InvoiceItemInput]


class InvoicePatch(BaseModel):
    due_date: str | None = None
    notes: str | None = None
    items: list[InvoiceItemInput] | None = None


class CancelBody(BaseModel):
    reason: str


class InvoicePayBody(BaseModel):
    amount: int
    payment_method: str = "cash"
    payment_reference: str | None = None
    payment_date: str | None = None
    notes: str | None = None


class BudgetCreate(BaseModel):
    account_id: str | None = None
    term_name: str
    academic_year: int
    name: str
    category: str | None = None
    budget_type: str
    budgeted_amount: int
    notes: str | None = None


class BudgetPatch(BaseModel):
    account_id: str | None = None
    name: str | None = None
    category: str | None = None
    budgeted_amount: int | None = None
    notes: str | None = None


# ── Chart of accounts (register after /accounts/student routes in main fees router) ──


@router.get("/accounts")
async def list_chart_accounts(
    account_type: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewAccounts")
    items = await coa_service.list_accounts(conn, school_id, account_type=account_type)
    return {"data": {"accounts": items}}


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def create_chart_account(
    body: ChartAccountCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageAccounts")
    if body.account_type not in ("income", "expense"):
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid account type.", "VALIDATION_ERROR")
    try:
        result = await coa_service.create_account(
            conn,
            school_id,
            fees_actor_id(user),
            code=body.code,
            name=body.name,
            account_type=body.account_type,
            category=body.category,
            description=body.description,
        )
    except asyncpg.UniqueViolationError:
        raise _error(status.HTTP_409_CONFLICT, "Account code already exists.", "DUPLICATE_CODE") from None
    return {"data": result}


@router.get("/accounts/{account_id}")
async def get_chart_account(
    account_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewAccounts")
    row = await coa_service.get_account(conn, school_id, account_id)
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Account not found.", "NOT_FOUND")
    return {"data": {"account": row}}


@router.patch("/accounts/{account_id}")
async def patch_chart_account(
    account_id: uuid.UUID,
    body: ChartAccountPatch,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageAccounts")
    try:
        result = await coa_service.update_account(
            conn,
            school_id,
            account_id,
            code=body.code,
            name=body.name,
            category=body.category,
            description=body.description,
            is_active=body.is_active,
        )
    except asyncpg.UniqueViolationError:
        raise _error(status.HTTP_409_CONFLICT, "Account code already exists.", "DUPLICATE_CODE") from None
    if not result:
        raise _error(status.HTTP_404_NOT_FOUND, "Account not found.", "NOT_FOUND")
    return {"data": result}


@router.delete("/accounts/{account_id}")
async def delete_chart_account(
    account_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageAccounts")
    outcome = await coa_service.soft_delete_account(conn, school_id, account_id)
    if outcome == "not_found":
        raise _error(status.HTTP_404_NOT_FOUND, "Account not found.", "NOT_FOUND")
    if outcome == "has_transactions":
        raise _error(
            status.HTTP_409_CONFLICT,
            "This account has existing transactions. It cannot be deleted, but you can deactivate it.",
            "HAS_TRANSACTIONS",
        )
    row = await coa_service.get_account(conn, school_id, account_id)
    return {"data": {"account": row}}


# ── Income sources ──


@router.get("/income-sources")
async def list_sources(
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")
    items = await sources_service.list_income_sources(conn, school_id)
    return {"data": {"sources": items}}


@router.post("/income-sources", status_code=status.HTTP_201_CREATED)
async def create_source(
    body: IncomeSourceCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageIncomeSources")
    try:
        row = await sources_service.create_income_source(
            conn,
            school_id,
            fees_actor_id(user),
            name=body.name,
            category=body.category,
            description=body.description,
        )
    except asyncpg.UniqueViolationError:
        raise _error(status.HTTP_409_CONFLICT, "Income source name already exists.", "DUPLICATE") from None
    return {"data": {"source": row}}


@router.patch("/income-sources/{source_id}")
async def patch_source(
    source_id: uuid.UUID,
    body: IncomeSourcePatch,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageIncomeSources")
    row = await sources_service.update_income_source(
        conn,
        school_id,
        source_id,
        name=body.name,
        category=body.category,
        description=body.description,
        is_active=body.is_active,
    )
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Income source not found.", "NOT_FOUND")
    return {"data": {"source": row}}


@router.delete("/income-sources/{source_id}")
async def delete_source(
    source_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageIncomeSources")
    row = await sources_service.deactivate_income_source(conn, school_id, source_id)
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Income source not found.", "NOT_FOUND")
    return {"data": {"source": row}}


# ── Other income ──


@router.get("/other-income")
async def list_other_income(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    source_id: str | None = Query(None),
    payment_method: str | None = Query(None),
    search: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")
    result = await other_income_service.list_other_income(
        conn,
        school_id,
        page=page,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        source_id=uuid.UUID(source_id) if source_id else None,
        payment_method=payment_method,
        search=search,
    )
    return {"data": result}


@router.post("/other-income", status_code=status.HTTP_201_CREATED)
async def create_other_income(
    body: OtherIncomeCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageOtherIncome")
    if body.payment_method not in PAYMENT_METHODS:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid payment method.", "VALIDATION_ERROR")
    try:
        result = await other_income_service.create_other_income(
            conn,
            school_id,
            fees_actor_id(user),
            source_id=uuid.UUID(body.source_id) if body.source_id else None,
            account_id=uuid.UUID(body.account_id) if body.account_id else None,
            description=body.description,
            income_date=body.income_date,
            payment_method=body.payment_method,
            payment_reference=body.payment_reference,
            notes=body.notes,
            items=[item.model_dump() for item in body.items],
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc), "VALIDATION_ERROR") from None
    return {"data": result}


@router.get("/other-income/{income_id}")
async def get_other_income(
    income_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")
    row = await other_income_service.get_other_income(conn, school_id, income_id)
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Income record not found.", "NOT_FOUND")
    return {"data": row}


@router.patch("/other-income/{income_id}")
async def patch_other_income(
    income_id: uuid.UUID,
    body: OtherIncomeCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageOtherIncome")
    try:
        row = await other_income_service.update_other_income(
            conn,
            school_id,
            income_id,
            source_id=uuid.UUID(body.source_id) if body.source_id else None,
            account_id=uuid.UUID(body.account_id) if body.account_id else None,
            description=body.description,
            income_date=body.income_date,
            payment_method=body.payment_method,
            payment_reference=body.payment_reference,
            notes=body.notes,
            items=[item.model_dump() for item in body.items],
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc), "VALIDATION_ERROR") from None
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Income record not found or voided.", "NOT_FOUND")
    return {"data": row}


@router.post("/other-income/{income_id}/void")
async def void_other_income(
    income_id: uuid.UUID,
    body: VoidBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "voidIncome")
    if not body.reason.strip():
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reason is required.", "VALIDATION_ERROR")
    row = await other_income_service.void_other_income(
        conn, school_id, income_id, fees_actor_id(user), body.reason
    )
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Income record not found.", "NOT_FOUND")
    return {"data": row}


@router.get("/other-income/{income_id}/receipt")
async def other_income_receipt(
    income_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")
    try:
        pdf_bytes, ref = await generate_other_income_receipt_pdf(conn, income_id, school_id)
    except OtherIncomeNotFoundError:
        raise _error(status.HTTP_404_NOT_FOUND, "Income record not found.", "NOT_FOUND") from None
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="income-{ref}.pdf"'},
    )


# ── Invoices ──


@router.get("/invoices/student/{student_id}")
async def student_invoices(
    student_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewInvoices")
    items = await invoice_service.list_student_invoices(conn, school_id, student_id)
    return {"data": {"invoices": items}}


@router.get("/invoices")
async def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    student_id: str | None = Query(None),
    class_id: str | None = Query(None),
    status: str | None = Query(None),
    term_name: str | None = Query(None),
    academic_year: int | None = Query(None),
    search: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewInvoices")
    result = await invoice_service.list_invoices(
        conn,
        school_id,
        page=page,
        limit=limit,
        student_id=uuid.UUID(student_id) if student_id else None,
        class_id=uuid.UUID(class_id) if class_id else None,
        status=status,
        term_name=term_name,
        academic_year=academic_year,
        search=search,
    )
    return {"data": result}


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageInvoices")
    if not body.items:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "At least one item is required.", "VALIDATION_ERROR")
    try:
        result = await invoice_service.create_invoice(
            conn, school_id, fees_actor_id(user), body.model_dump()
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc), "VALIDATION_ERROR") from None
    return {"data": result}


@router.post("/invoices/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_invoices(
    body: InvoiceBulkCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageInvoices")
    result = await invoice_service.bulk_create_invoices(
        conn, school_id, fees_actor_id(user), body.model_dump()
    )
    return {"data": result}


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewInvoices")
    row = await invoice_service.get_invoice(conn, school_id, invoice_id)
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Invoice not found.", "NOT_FOUND")
    return {"data": row}


@router.patch("/invoices/{invoice_id}")
async def patch_invoice(
    invoice_id: uuid.UUID,
    body: InvoicePatch,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageInvoices")
    inv = await invoice_service.get_invoice(conn, school_id, invoice_id)
    if not inv:
        raise _error(status.HTTP_404_NOT_FOUND, "Invoice not found.", "NOT_FOUND")
    if inv["status"] != "unpaid":
        raise _error(
            status.HTTP_409_CONFLICT,
            "This invoice has payments recorded against it and cannot be edited. Cancel it and create a new one.",
            "NOT_EDITABLE",
        )
    from datetime import date as date_type

    due = date_type.fromisoformat(body.due_date[:10]) if body.due_date else None
    row = await invoice_service.update_invoice(
        conn,
        school_id,
        invoice_id,
        due_date=due,
        notes=body.notes,
        items=[i.model_dump() for i in body.items] if body.items is not None else None,
    )
    return {"data": row}


@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: uuid.UUID,
    body: CancelBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageInvoices")
    outcome = await invoice_service.cancel_invoice(
        conn, school_id, invoice_id, fees_actor_id(user), body.reason
    )
    if outcome == "not_found":
        raise _error(status.HTTP_404_NOT_FOUND, "Invoice not found.", "NOT_FOUND")
    if outcome == "has_payments":
        raise _error(
            status.HTTP_409_CONFLICT,
            "This invoice has payments and cannot be cancelled. Void payments first.",
            "HAS_PAYMENTS",
        )
    if outcome == "not_editable":
        raise _error(status.HTTP_409_CONFLICT, "Invoice cannot be cancelled.", "NOT_EDITABLE")
    row = await invoice_service.get_invoice(conn, school_id, invoice_id)
    return {"data": row}


@router.post("/invoices/{invoice_id}/pay", status_code=status.HTTP_201_CREATED)
async def pay_invoice(
    invoice_id: uuid.UUID,
    body: InvoicePayBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "recordPayments")
    if body.payment_method not in PAYMENT_METHODS:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid payment method.", "VALIDATION_ERROR")
    pay_date = date.today()
    if body.payment_date:
        pay_date = date.fromisoformat(body.payment_date[:10])
    try:
        result = await invoice_service.pay_invoice(
            conn,
            school_id,
            fees_actor_id(user),
            invoice_id,
            amount=body.amount,
            payment_method=body.payment_method,
            payment_reference=body.payment_reference,
            payment_date=pay_date,
            notes=body.notes,
            recalculate_fee_account_fn=_recalculate_fee_account,
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc), "VALIDATION_ERROR") from None
    return {"data": result}


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(
    invoice_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewInvoices")
    try:
        pdf_bytes, number = await generate_invoice_pdf(conn, invoice_id, school_id)
    except InvoiceNotFoundError:
        raise _error(status.HTTP_404_NOT_FOUND, "Invoice not found.", "NOT_FOUND") from None
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{number}.pdf"'},
    )


# ── Budget ──


@router.get("/budget")
async def list_budget(
    term_name: str | None = Query(None),
    academic_year: int | None = Query(None),
    budget_type: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewBudget")
    items = await budget_service.list_budget_items(
        conn, school_id, term_name=term_name, academic_year=academic_year, budget_type=budget_type
    )
    return {"data": {"items": items}}


@router.get("/budget/report")
async def budget_report(
    term_name: str = Query(...),
    academic_year: int = Query(...),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewBudget")
    report = await budget_service.budget_report(conn, school_id, term_name=term_name, academic_year=academic_year)
    return {"data": report}


@router.post("/budget", status_code=status.HTTP_201_CREATED)
async def create_budget(
    body: BudgetCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageBudget")
    if body.budget_type not in ("income", "expense"):
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid budget type.", "VALIDATION_ERROR")
    try:
        row = await budget_service.create_budget_item(
            conn, school_id, fees_actor_id(user), body.model_dump()
        )
    except asyncpg.UniqueViolationError:
        raise _error(status.HTTP_409_CONFLICT, "Budget item already exists for this account and term.", "DUPLICATE") from None
    return {"data": {"item": row}}


@router.patch("/budget/{item_id}")
async def patch_budget(
    item_id: uuid.UUID,
    body: BudgetPatch,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageBudget")
    row = await budget_service.update_budget_item(conn, school_id, item_id, body.model_dump())
    if not row:
        raise _error(status.HTTP_404_NOT_FOUND, "Budget item not found.", "NOT_FOUND")
    return {"data": {"item": row}}


@router.delete("/budget/{item_id}")
async def delete_budget(
    item_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageBudget")
    ok = await budget_service.delete_budget_item(conn, school_id, item_id)
    if not ok:
        raise _error(status.HTTP_404_NOT_FOUND, "Budget item not found.", "NOT_FOUND")
    return {"data": {"deleted": True}}

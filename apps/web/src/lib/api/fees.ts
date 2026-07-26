import { apiClient } from "@/lib/api/client";
import type {
  AddFeeStructureItemPayload,
  BulkAddFeeStructureItemsPayload,
  CreateFeeStructurePayload,
  FeeStructureDetail,
  FeeStructureItem,
  ReorderFeeStructureItemsPayload,
  UpdateFeeStructureHeaderPayload,
  UpdateFeeStructureItemPayload,
} from "@/lib/fees/types";

const BASE = "/schools/fees/structures";

export function getFeeStructure(structureId: string) {
  return apiClient<FeeStructureDetail>(`${BASE}/${structureId}`).then((r) => r.data);
}

export function createFeeStructure(payload: CreateFeeStructurePayload) {
  return apiClient<FeeStructureDetail>(BASE, {
    method: "POST",
    body: payload,
  }).then((r) => r.data);
}

export function updateFeeStructureHeader(structureId: string, payload: UpdateFeeStructureHeaderPayload) {
  return apiClient<{ fee_structure: FeeStructureDetail }>(`${BASE}/${structureId}`, {
    method: "PATCH",
    body: payload,
  }).then((r) => r.data);
}

export function addFeeStructureItem(structureId: string, item: AddFeeStructureItemPayload) {
  return apiClient<FeeStructureItem>(`${BASE}/${structureId}/items`, {
    method: "POST",
    body: item,
  }).then((r) => r.data);
}

export function addFeeStructureItemsBulk(structureId: string, payload: BulkAddFeeStructureItemsPayload) {
  return apiClient<{ added: number; items: FeeStructureItem[] }>(`${BASE}/${structureId}/items/bulk`, {
    method: "POST",
    body: payload,
  }).then((r) => r.data);
}

export function updateFeeStructureItem(
  structureId: string,
  itemId: string,
  payload: UpdateFeeStructureItemPayload,
) {
  return apiClient<FeeStructureItem>(`${BASE}/${structureId}/items/${itemId}`, {
    method: "PATCH",
    body: payload,
  }).then((r) => r.data);
}

export function deleteFeeStructureItem(structureId: string, itemId: string) {
  return apiClient<{ deleted: boolean }>(`${BASE}/${structureId}/items/${itemId}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function reorderFeeStructureItems(structureId: string, payload: ReorderFeeStructureItemsPayload) {
  return apiClient<{ reordered: boolean }>(`${BASE}/${structureId}/items/reorder`, {
    method: "PUT",
    body: payload,
  }).then((r) => r.data);
}

export function deleteFeeStructure(structureId: string) {
  return apiClient<{ id: string; deleted: boolean; deleted_at: string }>(`${BASE}/${structureId}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function restoreFeeStructure(structureId: string) {
  return apiClient<FeeStructureDetail>(`${BASE}/${structureId}/restore`, {
    method: "POST",
  }).then((r) => r.data);
}

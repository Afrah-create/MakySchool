import { InvoiceDetailContent } from "@/components/fees/InvoiceDetailContent";

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDetailContent invoiceId={id} />;
}

import { redirect } from "next/navigation";

export default async function CheckoutReturnPage({ searchParams }: {
  searchParams: Promise<{ reference?: string | string[]; trxref?: string | string[] }>;
}) {
  const params = await searchParams;
  const reference = Array.isArray(params.reference) ? params.reference[0] : params.reference;
  const trxref = Array.isArray(params.trxref) ? params.trxref[0] : params.trxref;
  const paymentReference = reference || trxref;
  redirect(`/checkout?paystack=return${paymentReference ? `&reference=${encodeURIComponent(paymentReference)}` : ""}`);
}

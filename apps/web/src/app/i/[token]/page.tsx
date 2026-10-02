import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DOCUMENT_TYPE_LABEL, formatINR, type RenderableDocument } from "@organo/shared";
import { PublicDocument } from "./public-document";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function load(token: string): Promise<{ document: RenderableDocument; token: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const store = await cookies();
  const session = store.get("oh_session")?.value;
  const res = await fetch(`${API_URL}/api/public/documents/${token}`, {
    cache: "no-store",
    // Staff previewing a link are recognised by their session and not counted as a customer view.
    headers: session ? { cookie: `oh_session=${session}` } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
  return (await res.json()).data;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token).catch(() => null);
  if (!data) return { title: "Document not found" };
  const d = data.document;
  return {
    title: `${DOCUMENT_TYPE_LABEL[d.type]} ${d.number}`,
    description: `${d.business.name}: ${formatINR(d.totals.grandTotal)} for ${d.customer.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  return <PublicDocument doc={data.document} token={data.token} />;
}

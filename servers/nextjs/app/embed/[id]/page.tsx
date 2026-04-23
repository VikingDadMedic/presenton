import EmbedPlayer from "./EmbedPlayer";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmbedPlayer presentationId={id} />;
}

import EmbedPlayer from "./EmbedPlayer";

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <EmbedPlayer
      presentationId={id}
      autoPlay={query.autoPlay === "true"}
      interval={query.interval ? parseInt(query.interval, 10) : undefined}
      startSlide={query.start ? parseInt(query.start, 10) : undefined}
    />
  );
}

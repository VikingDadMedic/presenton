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
  const mode = query.mode === "showcase" ? "showcase" : "embed";
  const aspectRatio =
    (typeof query.aspectRatio === "string" && query.aspectRatio) ||
    (typeof query.aspect_ratio === "string" && query.aspect_ratio) ||
    undefined;
  // Pass undefined when not specified so EmbedPlayer can apply mode-aware defaults
  const autoPlayParam =
    query.autoPlay === "true"
      ? true
      : query.autoPlay === "false"
        ? false
        : undefined;
  return (
    <EmbedPlayer
      presentationId={id}
      mode={mode}
      aspectRatio={aspectRatio}
      autoPlay={autoPlayParam}
      interval={query.interval ? parseInt(query.interval, 10) : undefined}
      startSlide={query.start ? parseInt(query.start, 10) : undefined}
    />
  );
}

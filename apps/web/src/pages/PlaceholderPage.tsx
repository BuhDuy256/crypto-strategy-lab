// Shared placeholder body for a route whose real page content is
// built by a later slice. Contains no strategy, backtest, evaluation,
// or ranking logic — just a label.
interface PlaceholderPageProps {
  readonly title: string;
  readonly note: string;
}

export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="placeholder-note">{note}</p>
    </section>
  );
}

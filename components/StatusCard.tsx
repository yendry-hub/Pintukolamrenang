type StatusCardProps = {
  title: string
  value: string
  note?: string
}

export default function StatusCard({ title, value, note }: StatusCardProps) {
  return (
    <article className="rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="text-sm uppercase tracking-[0.24em] text-slate-500">{title}</h2>
      <p className="mt-4 text-4xl font-semibold text-slate-900">{value}</p>
      {note ? <p className="mt-3 text-sm text-slate-500">{note}</p> : null}
    </article>
  )
}

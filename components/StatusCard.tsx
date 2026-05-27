type StatusCardProps = {
  title: string
  value: string
  note?: string
}

export default function StatusCard({ title, value, note }: StatusCardProps) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900 leading-none">{value}</p>
      {note ? <p className="mt-2 text-sm text-slate-400">{note}</p> : null}
    </article>
  )
}

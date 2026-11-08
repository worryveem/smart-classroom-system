export default function PlaceholderPage({ title, description }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-600">{description}</p>
      <p className="text-sm text-slate-500">Trang khởi tạo — chức năng sẽ được triển khai ở giai đoạn sau.</p>
    </section>
  )
}

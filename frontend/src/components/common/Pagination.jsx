import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import './pagination.css'

export default function Pagination({ data, loading, setPage, label = 'Phân trang', className = '' }) {
  if (!data) return null
  const { page, size, totalElements, totalPages, rows } = data
  return <footer className={`table-pagination ${className}`}>
    <p>{rows.length ? `${page * size + 1}–${page * size + rows.length}` : '0'} / <strong>{new Intl.NumberFormat('vi-VN').format(totalElements)}</strong> bản ghi</p>
    <nav aria-label={label}>
      <button aria-label="Trang đầu" disabled={loading || page === 0} onClick={() => setPage(0)}><ChevronsLeft size={16} /></button>
      <button aria-label="Trang trước" disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
      <span>{totalPages === 0 ? 'Chưa có trang dữ liệu' : page >= totalPages ? `Trang ${page + 1} vượt phạm vi · ${totalPages} trang` : `Trang ${page + 1} / ${totalPages}`}</span>
      <button aria-label="Trang sau" disabled={loading || page + 1 >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
      <button aria-label="Trang cuối" disabled={loading || page + 1 >= totalPages} onClick={() => setPage(totalPages - 1)}><ChevronsRight size={16} /></button>
    </nav>
  </footer>
}

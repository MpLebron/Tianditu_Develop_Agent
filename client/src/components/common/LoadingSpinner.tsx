export function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">思考中...</span>
    </div>
  )
}

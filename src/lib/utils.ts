import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date))
}

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date))
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    available: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    occupied: "bg-blue-500/10 text-blue-600 border-blue-200",
    reserved: "bg-amber-500/10 text-amber-600 border-amber-200",
    dirty: "bg-orange-500/10 text-orange-600 border-orange-200",
    cleaning: "bg-purple-500/10 text-purple-600 border-purple-200",
    maintenance: "bg-red-500/10 text-red-600 border-red-200",
    pending: "bg-amber-500/10 text-amber-600 border-amber-200",
    completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    "in-progress": "bg-blue-500/10 text-blue-600 border-blue-200",
    inspected: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    confirmed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    cancelled: "bg-red-500/10 text-red-600 border-red-200",
    checked_in: "bg-blue-500/10 text-blue-600 border-blue-200",
    checked_out: "bg-gray-500/10 text-gray-600 border-gray-200",
    "no-show": "bg-red-500/10 text-red-600 border-red-200",
  }
  return colors[status] || "bg-gray-500/10 text-gray-600 border-gray-200"
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

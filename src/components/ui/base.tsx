"use client"

import { forwardRef, type ElementRef, type ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

export const Card = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl bg-white border border-border/50 shadow-card transition-all duration-200",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

export const CardHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

export const CardTitle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold text-lg leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

export const CardDescription = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

export const CardContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

export const Badge = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<"span"> & { variant?: "default" | "outline" | "gold" }>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-white",
      outline: "border border-border text-muted bg-transparent",
      gold: "bg-gold-50 text-gold-600 border border-gold-200",
    }
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export const Avatar = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div"> & { src?: string; alt?: string; fallback?: string }>(
  ({ className, src, alt, fallback, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex shrink-0 overflow-hidden rounded-full", className)} {...props}>
      {src ? (
        <img src={src} alt={alt || ""} className="aspect-square h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gold-400 to-gold-600 text-white text-xs font-medium">
          {fallback || "?"}
        </div>
      )}
    </div>
  )
)
Avatar.displayName = "Avatar"

export const StatusBadge = ({ status }: { status: string }) => {
  const labels: Record<string, string> = {
    available: "Available",
    occupied: "Occupied",
    reserved: "Reserved",
    dirty: "Dirty",
    cleaning: "Cleaning",
    maintenance: "Maintenance",
    pending: "Pending",
    completed: "Completed",
    "in-progress": "In Progress",
    inspected: "Inspected",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    "no-show": "No Show",
    paid: "Paid",
    refunded: "Refunded",
    closed: "Closed",
    resolved: "Resolved",
    open: "Open",
    active: "Active",
    inactive: "Inactive",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "critical": "Critical",
  }

  const colors: Record<string, string> = {
    available: "bg-emerald-50 text-emerald-700 border-emerald-200",
    occupied: "bg-blue-50 text-blue-700 border-blue-200",
    reserved: "bg-amber-50 text-amber-700 border-amber-200",
    dirty: "bg-orange-50 text-orange-700 border-orange-200",
    cleaning: "bg-purple-50 text-purple-700 border-purple-200",
    maintenance: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "in-progress": "bg-blue-50 text-blue-700 border-blue-200",
    inspected: "bg-emerald-50 text-emerald-700 border-emerald-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    checked_in: "bg-blue-50 text-blue-700 border-blue-200",
    checked_out: "bg-gray-50 text-gray-700 border-gray-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    refunded: "bg-purple-50 text-purple-700 border-purple-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-gray-50 text-gray-700 border-gray-200",
    open: "bg-amber-50 text-amber-700 border-amber-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-gray-50 text-gray-700 border-gray-200",
    low: "bg-gray-50 text-gray-600 border-gray-200",
    medium: "bg-amber-50 text-amber-600 border-amber-200",
    high: "bg-orange-50 text-orange-600 border-orange-200",
    critical: "bg-red-50 text-red-600 border-red-200",
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        colors[status] || "bg-gray-50 text-gray-700 border-gray-200"
      }`}
    >
      <span className={`status-dot ${status}`} />
      {labels[status] || status}
    </span>
  )
}

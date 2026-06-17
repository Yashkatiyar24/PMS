"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search, Filter, ChevronDown, X, CalendarDays, Clock,
  MapPin, MoreHorizontal, Phone, Mail, MessageSquare
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, StatusBadge, Avatar } from "@/components/ui/base"
import { bookings, properties, guests, getReservationTimeline } from "@/lib/data"
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils"
import type { Booking } from "@/lib/types"

export function ReservationsView() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  const filtered = bookings.filter(b => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return b.guestName.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.roomNumber.includes(q)
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Reservations</h1>
          <p className="text-muted text-sm mt-1">{bookings.length} total reservations</p>
        </div>
        <button className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          + New Booking
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by guest, booking ID, or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-white border border-border/50 rounded-xl text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold-200/50 focus:border-gold-300 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-white border border-border/50 rounded-xl">
          {["all", "confirmed", "checked_in", "checked_out", "cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                statusFilter === status
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-primary hover:bg-sand-50"
              )}
            >
              {status === "all" ? "All" : status === "checked_in" ? "In House" : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Guest</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Property</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Room</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Check-in</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Check-out</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-muted px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((booking, i) => (
                  <motion.tr
                    key={booking.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => setSelectedBooking(booking)}
                    className="border-b border-border/20 hover:bg-sand-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={booking.guestAvatar} alt={booking.guestName} className="w-9 h-9" />
                        <div>
                          <p className="text-sm font-medium text-primary">{booking.guestName}</p>
                          <p className="text-xs text-muted">{booking.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-primary">{properties.find(p => p.id === booking.propertyId)?.name?.slice(0, 20)}...</p>
                      <p className="text-xs text-muted">{properties.find(p => p.id === booking.propertyId)?.city}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-primary">Room {booking.roomNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-primary">{formatDate(booking.checkIn)}</p>
                      <p className="text-xs text-muted">{formatTime(booking.checkIn)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-primary">{formatDate(booking.checkOut)}</p>
                      <p className="text-xs text-muted">{formatTime(booking.checkOut)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-primary">{formatCurrency(booking.totalAmount)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sand-100">
                        <MoreHorizontal size={14} className="text-muted" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Booking Detail Panel */}
      <AnimatePresence>
        {selectedBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm"
            onClick={() => setSelectedBooking(null)}
          >
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-lg bg-white h-full overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <StatusBadge status={selectedBooking.status} />
                  <button onClick={() => setSelectedBooking(null)} className="p-1.5 rounded-lg hover:bg-sand-50">
                    <X size={16} className="text-muted" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar src={selectedBooking.guestAvatar} alt={selectedBooking.guestName} className="w-14 h-14" />
                  <div>
                    <h2 className="text-xl font-bold text-primary">{selectedBooking.guestName}</h2>
                    <p className="text-sm text-muted">{selectedBooking.id}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-sand-50">
                    <p className="text-xs text-muted mb-1">Check-in</p>
                    <p className="text-sm font-medium text-primary">{formatDate(selectedBooking.checkIn)}</p>
                    <p className="text-xs text-muted">{formatTime(selectedBooking.checkIn)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-sand-50">
                    <p className="text-xs text-muted mb-1">Check-out</p>
                    <p className="text-sm font-medium text-primary">{formatDate(selectedBooking.checkOut)}</p>
                    <p className="text-xs text-muted">{formatTime(selectedBooking.checkOut)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-primary mb-3">Booking Details</h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Property</span>
                      <span className="text-primary font-medium">{properties.find(p => p.id === selectedBooking.propertyId)?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Room</span>
                      <span className="text-primary font-medium">{selectedBooking.roomNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Guests</span>
                      <span className="text-primary font-medium">{selectedBooking.adults} adults, {selectedBooking.children} children</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Booking Source</span>
                      <span className="text-primary font-medium">{selectedBooking.source}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Total Amount</span>
                      <span className="text-primary font-semibold">{formatCurrency(selectedBooking.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Paid</span>
                      <span className="text-emerald-600 font-medium">{formatCurrency(selectedBooking.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Balance</span>
                      <span className={cn("font-medium", selectedBooking.totalAmount - selectedBooking.paidAmount > 0 ? "text-amber-600" : "text-emerald-600")}>
                        {formatCurrency(selectedBooking.totalAmount - selectedBooking.paidAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedBooking.specialRequests && (
                  <div>
                    <h4 className="text-sm font-medium text-primary mb-2">Special Requests</h4>
                    <p className="text-sm text-muted p-3 rounded-xl bg-sand-50">{selectedBooking.specialRequests}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium text-primary mb-3">Timeline</h4>
                  <div className="space-y-3">
                    {getReservationTimeline(selectedBooking.id).map((event, i) => (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-gold-500 mt-1.5" />
                          {i < 3 && <div className="w-px flex-1 bg-border/50" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-primary">{event.action}</p>
                          <p className="text-xs text-muted">{event.description} • {formatTime(event.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
                    Check In
                  </button>
                  <button className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-primary hover:bg-sand-50 transition-colors">
                    Contact Guest
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

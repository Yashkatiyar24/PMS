"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Search, Mail, Phone, MapPin, Award, CalendarDays,
  DollarSign, Shield, MessageSquare, Star, MoreHorizontal
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Avatar, Badge, StatusBadge } from "@/components/ui/base"
import { guests, bookings, properties } from "@/lib/data"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

const tierColors: Record<string, string> = {
  platinum: "from-zinc-300 via-white to-gold-300 border-gold-300 text-gold-700",
  gold: "from-amber-100 to-amber-200 border-amber-300 text-amber-700",
  silver: "from-gray-100 to-gray-200 border-gray-300 text-gray-700",
  bronze: "from-orange-100 to-orange-200 border-orange-300 text-orange-700",
}

export function GuestsView() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null)

  const filtered = guests.filter(g => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return g.firstName.toLowerCase().includes(q) || g.lastName.toLowerCase().includes(q) || g.email.toLowerCase().includes(q)
    }
    return true
  })

  const guest = guests.find(g => g.id === selectedGuest)
  const guestBookings = bookings.filter(b => b.guestId === selectedGuest)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Guests</h1>
          <p className="text-muted text-sm mt-1">{guests.length} registered guests</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search guests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-4 bg-white border border-border/50 rounded-xl text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold-200/50 focus:border-gold-300 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((guest, i) => (
          <motion.div
            key={guest.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            whileHover={{ y: -3 }}
            onClick={() => setSelectedGuest(guest.id)}
          >
            <Card className="cursor-pointer hover:shadow-elevated transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar src={guest.avatar} alt={guest.firstName} className="w-12 h-12 ring-2 ring-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary">{guest.firstName} {guest.lastName}</p>
                    <p className="text-xs text-muted truncate">{guest.email}</p>
                  </div>
                  <button className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sand-50">
                    <MoreHorizontal size={14} className="text-muted" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                    tierColors[guest.tier]
                  )}>
                    <Award size={10} />
                    {guest.tier.charAt(0).toUpperCase() + guest.tier.slice(1)}
                  </span>
                  {guest.idVerified && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Shield size={10} />
                      Verified
                    </span>
                  )}
                  <span className="text-[10px] text-muted bg-sand-50 px-2 py-0.5 rounded-full">{guest.nationality}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center pt-3 border-t border-border/30">
                  <div>
                    <p className="text-sm font-bold text-primary">{guest.totalBookings}</p>
                    <p className="text-[10px] text-muted">Stays</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary">{formatCurrency(guest.totalSpent)}</p>
                    <p className="text-[10px] text-muted">Total Spent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Guest Detail Panel */}
      {selectedGuest && guest && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm"
          onClick={() => setSelectedGuest(null)}
        >
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-full max-w-lg bg-white h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-40 bg-gradient-to-br from-gold-400/20 to-gold-600/20">
              <div className="absolute -bottom-10 left-6">
                <Avatar src={guest.avatar} alt={guest.firstName} className="w-20 h-20 ring-4 ring-white shadow-elevated" />
              </div>
            </div>
            <div className="pt-14 px-6 pb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-primary">{guest.firstName} {guest.lastName}</h2>
                <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border", tierColors[guest.tier])}>
                  <Award size={12} />
                  {guest.tier.charAt(0).toUpperCase() + guest.tier.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted mb-4">
                <span className="flex items-center gap-1"><Mail size={12} /> {guest.email}</span>
                <span className="flex items-center gap-1"><Phone size={12} /> {guest.phone}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 rounded-xl bg-sand-50 text-center">
                  <p className="text-lg font-bold text-primary">{guest.totalBookings}</p>
                  <p className="text-[10px] text-muted">Total Stays</p>
                </div>
                <div className="p-3 rounded-xl bg-sand-50 text-center">
                  <p className="text-lg font-bold text-primary">{formatCurrency(guest.totalSpent)}</p>
                  <p className="text-[10px] text-muted">Total Spent</p>
                </div>
                <div className="p-3 rounded-xl bg-sand-50 text-center">
                  <p className="text-lg font-bold text-primary">{formatCurrency(Math.round(guest.totalSpent / guest.totalBookings))}</p>
                  <p className="text-[10px] text-muted">Avg. per Stay</p>
                </div>
              </div>

              {guest.preferences.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-medium text-primary mb-2">Preferences</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {guest.preferences.map((p) => (
                      <span key={p} className="text-xs bg-sand-50 text-muted px-2.5 py-1 rounded-full border border-border/30">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-5">
                <h4 className="text-sm font-medium text-primary mb-3">Booking History</h4>
                <div className="space-y-2">
                  {guestBookings.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-sand-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sand-200 to-sand-300 flex items-center justify-center text-xs font-medium text-muted">
                        {b.roomNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary">{properties.find(p => p.id === b.propertyId)?.name}</p>
                        <p className="text-xs text-muted">{formatDate(b.checkIn)} — {formatDate(b.checkOut)}</p>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
                  Message Guest
                </button>
                <button className="h-10 px-4 rounded-xl border border-border text-sm font-medium text-primary hover:bg-sand-50 transition-colors">
                  View All History
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  LayoutDashboard, CalendarDays, Users, Sparkles, Bell,
  Wallet, ChevronRight, ArrowUpRight, ArrowDownRight
} from "lucide-react"
import { Card, CardContent, Avatar, StatusBadge, Badge } from "@/components/ui/base"
import {
  properties, bookings, rooms, guests, todayRevenue,
  monthlyRevenue, occupancyRate, checkInsToday, checkOutsToday,
  pendingCleaning, availableRooms
} from "@/lib/data"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "reservations", label: "Reservations", icon: CalendarDays },
  { id: "guests", label: "Guests", icon: Users },
  { id: "housekeeping", label: "Cleaning", icon: Sparkles },
  { id: "revenue", label: "Revenue", icon: Wallet },
]

export function MobileView() {
  const [activeTab, setActiveTab] = useState("dashboard")

  const recentBookings = bookings.filter(b => b.status === "checked_in" || b.status === "confirmed").slice(0, 5)

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-4 pb-24">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-xl font-bold text-primary">Overview</h1>
                <p className="text-xs text-muted">{properties.length} properties</p>
              </div>
              <div className="relative">
                <Bell size={18} className="text-muted" />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gold-500 text-white text-[7px] font-bold flex items-center justify-center">3</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Revenue Today", value: formatCurrency(todayRevenue), change: "+12%", icon: Wallet, color: "from-gold-400/20 to-gold-500/10", positive: true },
                { label: "Monthly", value: formatCurrency(monthlyRevenue), change: "+8%", icon: Wallet, color: "from-emerald-500/20 to-emerald-600/10", positive: true },
                { label: "Occupancy", value: `${occupancyRate}%`, change: "+5%", icon: LayoutDashboard, color: "from-blue-500/20 to-blue-600/10", positive: true },
                { label: "Check-ins", value: checkInsToday.toString(), change: "+4", icon: CalendarDays, color: "from-purple-500/20 to-purple-600/10", positive: true },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", stat.color)}>
                        <stat.icon size={14} className="text-primary" />
                      </div>
                      <span className={cn("text-[10px] font-medium", stat.positive ? "text-emerald-600" : "text-red-500")}>
                        {stat.change}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-primary">{stat.value}</p>
                    <p className="text-[10px] text-muted">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-primary">Today&apos;s Schedule</h3>
                  <span className="text-xs text-muted">8 events</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-sand-50">
                    <div className="w-1 h-8 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-xs font-medium text-primary">Check-in: James Anderson</p>
                      <p className="text-[10px] text-muted">Penthouse at NoMad • Room 401</p>
                    </div>
                    <span className="ml-auto text-xs text-muted">3:00 PM</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-sand-50">
                    <div className="w-1 h-8 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-xs font-medium text-primary">Check-out: Sophia Chen</p>
                      <p className="text-[10px] text-muted">Soho Loft • Room 202</p>
                    </div>
                    <span className="ml-auto text-xs text-muted">11:00 AM</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-sand-50">
                    <div className="w-1 h-8 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-xs font-medium text-primary">Cleaning: Room 304</p>
                      <p className="text-[10px] text-muted">Tribeca Sky Suite</p>
                    </div>
                    <span className="ml-auto text-xs text-muted">2:00 PM</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-primary">Active Guests</h3>
                  <ChevronRight size={14} className="text-muted" />
                </div>
                <div className="space-y-2">
                  {guests.slice(0, 3).map((guest) => (
                    <div key={guest.id} className="flex items-center gap-3">
                      <Avatar src={guest.avatar} alt={guest.firstName} className="w-8 h-8" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary">{guest.firstName} {guest.lastName}</p>
                        <p className="text-[10px] text-muted">Room {bookings.find(b => b.guestId === guest.id)?.roomNumber || "—"}</p>
                      </div>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">In House</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case "reservations":
        return (
          <div className="space-y-3 pb-24">
            <h1 className="text-xl font-bold text-primary mb-4">Reservations</h1>
            {recentBookings.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar src={b.guestAvatar} alt={b.guestName} className="w-10 h-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">{b.guestName}</p>
                      <p className="text-xs text-muted">Room {b.roomNumber} • {formatDate(b.checkIn)}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )

      case "guests":
        return (
          <div className="space-y-3 pb-24">
            <h1 className="text-xl font-bold text-primary mb-4">Guests</h1>
            {guests.slice(0, 10).map((g) => (
              <Card key={g.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={g.avatar} alt={g.firstName} className="w-10 h-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">{g.firstName} {g.lastName}</p>
                      <p className="text-xs text-muted">{g.nationality} • {g.totalBookings} stays</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      g.tier === "platinum" ? "bg-gold-50 text-gold-700" : g.tier === "gold" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"
                    )}>{g.tier}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )

      case "housekeeping":
        return (
          <div className="space-y-3 pb-24">
            <h1 className="text-xl font-bold text-primary mb-4">Housekeeping</h1>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">{pendingCleaning} Pending</Badge>
            </div>
            {rooms.filter(r => r.status === "dirty" || r.status === "cleaning").slice(0, 8).map((room) => (
              <Card key={room.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">Room {room.number}</p>
                      <p className="text-xs text-muted">{properties.find(p => p.id === room.propertyId)?.name}</p>
                    </div>
                    <StatusBadge status={room.status === "dirty" ? "dirty" : "cleaning"} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )

      case "revenue":
        return (
          <div className="space-y-3 pb-24">
            <h1 className="text-xl font-bold text-primary mb-4">Revenue</h1>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted mb-1">Today</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(todayRevenue)}</p>
                  <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">+12.3% <ArrowUpRight size={10} /></span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted mb-1">This Month</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(monthlyRevenue)}</p>
                  <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">+8.1% <ArrowUpRight size={10} /></span>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-primary mb-3">Recent Transactions</h3>
                <div className="space-y-2">
                  {bookings.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                      <div>
                        <p className="text-xs font-medium text-primary">{b.guestName}</p>
                        <p className="text-[10px] text-muted">{b.id}</p>
                      </div>
                      <span className="text-xs font-semibold text-primary">{formatCurrency(b.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      <div className="px-4 pt-4 pb-4">
        {renderContent()}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-border/50 safe-area-inset-bottom">
        <div className="flex items-center justify-around py-2 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all",
                  isActive ? "text-primary" : "text-muted"
                )}
              >
                <Icon size={20} className={isActive ? "text-gold-500" : ""} />
                <span className={cn("text-[9px] font-medium", isActive && "text-gold-500")}>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

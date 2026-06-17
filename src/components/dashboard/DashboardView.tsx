"use client"

import { motion } from "framer-motion"
import {
  Building2, TrendingUp, DollarSign, CalendarDays, Users,
  LogIn, LogOut, Sparkles, DoorOpen, Wrench, ArrowUpRight,
  ArrowDownRight, MoreHorizontal, ChevronRight
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Avatar } from "@/components/ui/base"
import { cn, formatCurrency } from "@/lib/utils"
import {
  properties, bookings, rooms, guests, analyticsData,
  todayRevenue, monthlyRevenue, activeGuests,
  checkInsToday, checkOutsToday, pendingCleaning,
  availableRooms, maintenanceRequests, occupancyRate
} from "@/lib/data"
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts"

const statCards = [
  { label: "Total Properties", value: "25", icon: Building2, change: "+2", positive: true, color: "from-blue-500/20 to-blue-600/10" },
  { label: "Occupancy Rate", value: `${occupancyRate}%`, icon: TrendingUp, change: "+5.2%", positive: true, color: "from-emerald-500/20 to-emerald-600/10" },
  { label: "Revenue Today", value: formatCurrency(todayRevenue), icon: DollarSign, change: "+12.3%", positive: true, color: "from-gold-400/20 to-gold-500/10" },
  { label: "Monthly Revenue", value: formatCurrency(monthlyRevenue), icon: CalendarDays, change: "+8.1%", positive: true, color: "from-purple-500/20 to-purple-600/10" },
  { label: "Active Guests", value: activeGuests.toString(), icon: Users, change: "-3", positive: false, color: "from-blue-500/20 to-blue-600/10" },
  { label: "Check-ins Today", value: checkInsToday.toString(), icon: LogIn, change: "+4", positive: true, color: "from-emerald-500/20 to-emerald-600/10" },
  { label: "Check-outs Today", value: checkOutsToday.toString(), icon: LogOut, change: "+2", positive: true, color: "from-amber-500/20 to-amber-600/10" },
  { label: "Pending Cleaning", value: pendingCleaning.toString(), icon: Sparkles, change: "-8", positive: true, color: "from-orange-500/20 to-orange-600/10" },
  { label: "Available Rooms", value: availableRooms.toString(), icon: DoorOpen, change: "+15", positive: true, color: "from-emerald-500/20 to-emerald-600/10" },
  { label: "Maintenance", value: maintenanceRequests.toString(), icon: Wrench, change: "+2", positive: false, color: "from-red-500/20 to-red-600/10" },
]

export function DashboardView() {
  const recentBookings = bookings.filter(b => b.status === "checked_in" || b.status === "confirmed").slice(0, 5)
  const topProperties = [...properties].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white rounded-xl shadow-elevated border border-border/50 p-3 text-sm">
          <p className="font-medium text-muted mb-1">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} style={{ color: entry.color }} className="font-semibold">
              {entry.name}: {entry.name === "Revenue" ? formatCurrency(entry.value) : `${entry.value}%`}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">Executive Dashboard</h1>
            <p className="text-muted text-sm mt-1">Welcome back, Yash. Here&apos;s your portfolio overview.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Last 30 days</Badge>
            <button className="p-2 rounded-xl hover:bg-sand-50 transition-colors">
              <MoreHorizontal size={16} className="text-muted" />
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3"
      >
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
            >
              <Card className="group hover:shadow-elevated cursor-default">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center", stat.color)}>
                      <Icon size={16} className="text-primary" />
                    </div>
                    <span className={cn(
                      "flex items-center gap-0.5 text-xs font-medium",
                      stat.positive ? "text-emerald-600" : "text-red-500"
                    )}>
                      {stat.change}
                      {stat.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-primary tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Revenue & Occupancy</CardTitle>
                <p className="text-xs text-muted mt-0.5">12-month overview</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gold-500" />
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Occupancy
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analyticsData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A227" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" strokeOpacity={0.5} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#C9A227" strokeWidth={2} fill="url(#revenueGradient)" name="Revenue" />
                    <Area yAxisId="right" type="monotone" dataKey="occupancy" stroke="#10B981" strokeWidth={2} fill="none" name="Occupancy" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active Guests</CardTitle>
              <p className="text-xs text-muted mt-0.5">Currently checked in</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {guests.slice(0, 5).map((guest, i) => (
                  <motion.div
                    key={guest.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-sand-50 transition-colors cursor-pointer group"
                  >
                    <Avatar src={guest.avatar} alt={guest.firstName} className="w-10 h-10 ring-2 ring-white" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">{guest.firstName} {guest.lastName}</p>
                      <p className="text-xs text-muted">{guest.nationality} • Room {bookings.find(b => b.guestId === guest.id)?.roomNumber || "—"}</p>
                    </div>
                    <span className="text-xs text-muted">{bookings.find(b => b.guestId === guest.id)?.status === "checked_in" ? "● In house" : "—"}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Reservations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {recentBookings.map((booking, i) => (
                  <div key={booking.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sand-50 transition-colors cursor-pointer">
                    <Avatar src={booking.guestAvatar} alt={booking.guestName} className="w-9 h-9" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">{booking.guestName}</p>
                      <p className="text-xs text-muted">{properties.find(p => p.id === booking.propertyId)?.name} • Room {booking.roomNumber}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      booking.status === "checked_in" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {booking.status === "checked_in" ? "In House" : "Upcoming"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Properties</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {topProperties.map((prop, i) => (
                  <div key={prop.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sand-50 transition-colors cursor-pointer">
                    <div className="w-12 h-9 rounded-lg overflow-hidden shrink-0 bg-sand-100">
                      <div className="w-full h-full bg-gradient-to-br from-sand-200 to-sand-300 flex items-center justify-center text-xs text-muted">
                        {prop.city.slice(0, 2)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{prop.name}</p>
                      <p className="text-xs text-muted">{prop.city} • {prop.occupancy}% occupied</p>
                    </div>
                    <p className="text-sm font-semibold text-primary">{formatCurrency(prop.revenue)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ADR & RevPAR</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" strokeOpacity={0.5} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8E8E93" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8E8E93" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="adr" fill="#C9A227" radius={[4, 4, 0, 0]} name="ADR" />
                    <Bar dataKey="revpar" fill="#8B7355" radius={[4, 4, 0, 0]} name="RevPAR" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

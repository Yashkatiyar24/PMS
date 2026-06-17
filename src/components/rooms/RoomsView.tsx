"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Search, Filter, MoreHorizontal, Wifi, Tv, Wind,
  Droplets, Coffee, Lock
} from "lucide-react"
import { Card, CardContent, StatusBadge, Badge } from "@/components/ui/base"
import { rooms, properties } from "@/lib/data"
import { cn, formatCurrency } from "@/lib/utils"

const amenityIcons: Record<string, any> = {
  "Pool": Droplets,
  "Gym": Wind,
  "Rooftop Terrace": Wind,
  "Smart Home": Tv,
  "Rain Shower": Droplets,
  "Italian Marble Floors": Wind,
  "Walk-in Closet": Lock,
  "Private Balcony": Wind,
  "Chef's Kitchen": Coffee,
  "Home Theater": Tv,
}

export function RoomsView() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedProperty, setSelectedProperty] = useState<string>("all")

  const filtered = rooms.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false
    if (selectedProperty !== "all" && r.propertyId !== selectedProperty) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return r.number.includes(q) || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Rooms</h1>
          <p className="text-muted text-sm mt-1">{rooms.length} rooms across {properties.length} properties</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-white border border-border/50 rounded-xl text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold-200/50 focus:border-gold-300 transition-all"
          />
        </div>
        <select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          className="h-10 px-3 bg-white border border-border/50 rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-gold-200/50"
        >
          <option value="all">All Properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 p-1 bg-white border border-border/50 rounded-xl">
          {["all", "available", "occupied", "reserved", "dirty", "cleaning", "maintenance"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                statusFilter === status ? "bg-primary text-white shadow-sm" : "text-muted hover:text-primary hover:bg-sand-50"
              )}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {filtered.map((room, idx) => {
          const prop = properties.find(p => p.id === room.propertyId)
          return (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              whileHover={{ y: -3 }}
            >
              <Card className="overflow-hidden group cursor-pointer hover:shadow-elevated transition-all duration-300">
                <div className="relative h-40 overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-br from-sand-200 to-sand-300" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-white/80">{room.number}</p>
                      <p className="text-xs text-white/60">{room.type}</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={room.status} />
                  </div>
                </div>
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-primary">Room {room.number}</p>
                    <p className="text-sm font-bold text-primary">{formatCurrency(room.price)}<span className="text-xs text-muted font-normal">/night</span></p>
                  </div>
                  <p className="text-xs text-muted mb-2">{prop?.name} • Floor {room.floor}</p>
                  {room.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {room.amenities.slice(0, 3).map((a) => {
                        const Icon = amenityIcons[a] || Coffee
                        return (
                          <span key={a} className="flex items-center gap-1 text-[10px] text-muted bg-sand-50 px-1.5 py-0.5 rounded-md border border-border/30">
                            <Icon size={10} />
                            {a}
                          </span>
                        )
                      })}
                      {room.amenities.length > 3 && (
                        <span className="text-[10px] text-muted">+{room.amenities.length - 3}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs text-muted">
                    <span>Up to {room.capacity} guests</span>
                    <span className={cn(
                      "font-medium",
                      room.cleaningStatus === "completed" ? "text-emerald-600" : room.cleaningStatus === "inspected" ? "text-blue-600" : "text-amber-600"
                    )}>
                      {room.cleaningStatus === "completed" ? "✓ Clean" : room.cleaningStatus === "inspected" ? "● Inspected" : "○ Needs cleaning"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

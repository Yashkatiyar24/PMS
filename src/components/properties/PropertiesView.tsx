"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Building2, MapPin, TrendingUp, Bed, Users, MoreHorizontal,
  Edit3, BarChart3, Eye, Star
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, StatusBadge, Avatar } from "@/components/ui/base"
import { properties, bookings, rooms } from "@/lib/data"
import { cn, formatCurrency } from "@/lib/utils"

export function PropertiesView() {
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Properties</h1>
          <p className="text-muted text-sm mt-1">Manage your {properties.length} luxury properties</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{properties.filter(p => p.status === "active").length} Active</Badge>
          <Badge variant="outline" className="text-xs">{properties.reduce((a, b) => a + b.rooms, 0)} Total Rooms</Badge>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5"
      >
        {properties.map((property, idx) => {
          const propertyBookings = bookings.filter(b => b.propertyId === property.id)
          const activeBookings = propertyBookings.filter(b => b.status === "checked_in" || b.status === "confirmed").length
          const propertyRooms = rooms.filter(r => r.propertyId === property.id)
          const availRooms = propertyRooms.filter(r => r.status === "available").length

          return (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              whileHover={{ y: -4 }}
              className="group cursor-pointer"
              onClick={() => setSelectedProperty(selectedProperty === property.id ? null : property.id)}
            >
              <Card className="overflow-hidden hover:shadow-elevated transition-all duration-300">
                <div className="relative h-48 overflow-hidden">
                  <div
                    className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${property.image})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={property.status} />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="text-white font-semibold text-base leading-tight">{property.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin size={12} className="text-white/70" />
                      <span className="text-white/80 text-xs">{property.city}</span>
                    </div>
                  </div>
                  <div className="absolute top-3 left-3">
                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5">
                      <Star size={10} className="text-gold-400 fill-gold-400" />
                      <span className="text-white text-xs font-medium">{property.rating}</span>
                    </div>
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{property.occupancy}%</p>
                      <p className="text-[10px] text-muted">Occupied</p>
                    </div>
                    <div className="text-center border-x border-border/50">
                      <p className="text-lg font-bold text-primary">{formatCurrency(property.revenue)}</p>
                      <p className="text-[10px] text-muted">Revenue</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{activeBookings}</p>
                      <p className="text-[10px] text-muted">Active</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Bed size={12} />
                      <span>{availRooms}/{property.rooms} avail</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-sand-50 transition-colors">
                        <Eye size={14} className="text-muted" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-sand-50 transition-colors">
                        <Edit3 size={14} className="text-muted" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-sand-50 transition-colors">
                        <BarChart3 size={14} className="text-muted" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Property Detail Panel */}
      {selectedProperty && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setSelectedProperty(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white rounded-2xl shadow-modal w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const prop = properties.find(p => p.id === selectedProperty)!
              return (
                <div>
                  <div className="relative h-56">
                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${prop.image})` }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <button
                      onClick={() => setSelectedProperty(null)}
                      className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                    >
                      ✕
                    </button>
                    <div className="absolute bottom-4 left-4">
                      <h2 className="text-2xl font-bold text-white">{prop.name}</h2>
                      <p className="text-white/80 text-sm">{prop.city}, {prop.country}</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-5">
                    <p className="text-sm text-muted">{prop.description}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-xl bg-sand-50">
                        <p className="text-xl font-bold text-primary">{prop.rooms}</p>
                        <p className="text-xs text-muted">Rooms</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-sand-50">
                        <p className="text-xl font-bold text-primary">{prop.occupancy}%</p>
                        <p className="text-xs text-muted">Occupancy</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-sand-50">
                        <p className="text-xl font-bold text-primary">{formatCurrency(prop.revenue)}</p>
                        <p className="text-xs text-muted">Revenue</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-sand-50">
                        <p className="text-xl font-bold text-primary">{prop.rating}</p>
                        <p className="text-xs text-muted">Rating</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-primary mb-2">Amenities</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {prop.amenities.map((a) => (
                          <span key={a} className="text-xs bg-sand-50 text-muted px-2.5 py-1 rounded-full border border-border/30">{a}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
                        View Rooms
                      </button>
                      <button className="h-10 px-4 rounded-xl border border-border text-sm font-medium text-primary hover:bg-sand-50 transition-colors">
                        Edit Property
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

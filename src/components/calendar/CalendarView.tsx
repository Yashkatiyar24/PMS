"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, StatusBadge } from "@/components/ui/base"
import { calendarEvents, rooms, properties } from "@/lib/data"
import { cn } from "@/lib/utils"

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<"month" | "week">("month")

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const getEventsForDay = (day: number) => {
    return calendarEvents.filter(event => {
      const start = new Date(event.checkIn)
      const end = new Date(event.checkOut)
      const checkDate = new Date(year, month, day)
      return checkDate >= start && checkDate < end
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Calendar</h1>
          <p className="text-muted text-sm mt-1">Manage reservations and availability</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-white border border-border/50 rounded-xl">
            {["month", "week"].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as "month" | "week")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  viewMode === mode ? "bg-primary text-white shadow-sm" : "text-muted hover:text-primary"
                )}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-sand-50 transition-colors">
                <ChevronLeft size={18} className="text-muted" />
              </button>
              <h2 className="text-lg font-semibold text-primary">
                {monthNames[month]} {year}
              </h2>
              <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-sand-50 transition-colors">
                <ChevronRight size={18} className="text-muted" />
              </button>
            </div>
            <button className="text-sm text-gold-600 hover:text-gold-700 font-medium transition-colors">
              Today
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border/30 rounded-xl overflow-hidden">
            {Array.from({ length: firstDayOfMonth + daysInMonth }, (_, i) => {
              const day = i - firstDayOfMonth + 1
              if (day < 1 || day > daysInMonth) {
                return <div key={i} className="min-h-[100px] bg-sand-50/30 p-1" />
              }
              const events = getEventsForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year

              return (
                <motion.div
                  key={i}
                  whileHover={{ backgroundColor: "rgba(250, 250, 245, 0.8)" }}
                  onClick={() => setSelectedDate(selectedDate === day ? null : day)}
                  className={cn(
                    "min-h-[100px] bg-white p-1.5 cursor-pointer transition-colors border border-border/20",
                    isToday && "ring-2 ring-gold-300/50 ring-inset",
                    selectedDate === day && "bg-sand-50"
                  )}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1",
                    isToday ? "bg-gold-500 text-white" : "text-muted"
                  )}>
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {events.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="text-[10px] px-1.5 py-0.5 rounded truncate text-white font-medium"
                        style={{ backgroundColor: event.color }}
                      >
                        {event.guestName.split(" ")[0]}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div className="text-[10px] text-muted px-1">+{events.length - 3} more</div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {monthNames[month]} {selectedDate}, {year} — Reservations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {getEventsForDay(selectedDate).length === 0 ? (
                <p className="text-sm text-muted">No reservations for this date.</p>
              ) : (
                getEventsForDay(selectedDate).map((event) => (
                  <div key={event.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-sand-50 transition-colors">
                    <div className="w-1 h-10 rounded-full" style={{ backgroundColor: event.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-primary">{event.guestName}</p>
                      <p className="text-xs text-muted">Room {event.roomNumber} • {properties.find(p => p.id === event.propertyId)?.city}</p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>{event.checkIn.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      <p>→ {event.checkOut.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

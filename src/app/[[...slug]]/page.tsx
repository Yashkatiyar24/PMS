"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { DashboardView } from "@/components/dashboard/DashboardView"
import { PropertiesView } from "@/components/properties/PropertiesView"
import { ReservationsView } from "@/components/reservations/ReservationsView"
import { CalendarView } from "@/components/calendar/CalendarView"
import { RoomsView } from "@/components/rooms/RoomsView"
import { GuestsView } from "@/components/guests/GuestsView"
import { HousekeepingView } from "@/components/housekeeping/HousekeepingView"
import { MaintenanceView } from "@/components/maintenance/MaintenanceView"
import { FinanceView } from "@/components/finance/FinanceView"
import { AnalyticsView } from "@/components/analytics/AnalyticsView"
import { BookingView } from "@/components/booking/BookingView"
import { MobileView } from "@/components/mobile/MobileView"

export default function Home() {
  const params = useParams()
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string | undefined)
  const validViews = ["dashboard", "properties", "reservations", "calendar", "rooms", "guests", "housekeeping", "maintenance", "finance", "analytics"]
  const initialView = slug && validViews.includes(slug) ? slug : "dashboard"
  const [activeView, setActiveView] = useState(initialView)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showMobile, setShowMobile] = useState(false)

  const renderView = () => {
    const views: Record<string, React.ReactNode> = {
      dashboard: <DashboardView />,
      properties: <PropertiesView />,
      reservations: <ReservationsView />,
      calendar: <CalendarView />,
      rooms: <RoomsView />,
      guests: <GuestsView />,
      housekeeping: <HousekeepingView />,
      maintenance: <MaintenanceView />,
      finance: <FinanceView />,
      analytics: <AnalyticsView />,
    }
    return views[activeView] || <DashboardView />
  }

  if (showMobile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">P</span>
            </div>
            <span className="font-semibold text-sm">Prestige PMS</span>
          </div>
          <button
            onClick={() => setShowMobile(false)}
            className="text-xs text-gold-600 font-medium bg-gold-50 px-3 py-1.5 rounded-full"
          >
            Desktop View
          </button>
        </div>
        <MobileView />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      <TopBar collapsed={sidebarCollapsed} />

      <main
        className={`pt-16 min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? "ml-[72px]" : "ml-64"
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowMobile(true)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-primary border border-border/50 rounded-lg px-3 py-1.5 hover:bg-sand-50 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" x2="12" y1="18" y2="18"/></svg>
              Mobile Preview
            </button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

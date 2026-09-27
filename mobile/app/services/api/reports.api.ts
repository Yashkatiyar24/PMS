import type {
  CashInHand,
  Daily,
  Forecast,
  OnlineOrder,
  OnlinePayments,
  Outstanding,
  PeriodReport,
  PortfolioRow,
} from "@/features/reports/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/reports/**`, `/api/payments/online`, `/api/portfolio` */
export class ReportsApi {
  constructor(private readonly client: ApiClient) {}

  daily(): Promise<ApiResult<Daily>> {
    return this.client.get("/api/reports/daily")
  }

  sendDaily(): Promise<ApiResult<Daily>> {
    return this.client.post("/api/reports/daily/send")
  }

  outstanding(): Promise<ApiResult<Outstanding[]>> {
    return this.client.get("/api/reports/outstanding")
  }

  cashInHand(): Promise<ApiResult<CashInHand[]>> {
    return this.client.get("/api/reports/cash-in-hand")
  }

  cashHandover(userId: string): Promise<ApiResult<{ handoverId: string; amountPaise: number }>> {
    return this.client.post("/api/reports/cash-handover", { userId, notes: "" })
  }

  forecast(from: string, days: number): Promise<ApiResult<Forecast>> {
    return this.client.get("/api/reports/forecast", { from, days })
  }

  period(from: string, to: string): Promise<ApiResult<PeriodReport>> {
    return this.client.get("/api/reports/period", { from, to })
  }

  periodCsv(from: string, to: string): Promise<ApiResult<string>> {
    return this.client.getText("/api/reports/period.csv", { from, to })
  }

  monthCsv(): Promise<ApiResult<string>> {
    return this.client.getText("/api/reports/month.csv")
  }

  policeRegisterCsv(from: string, to: string): Promise<ApiResult<string>> {
    return this.client.getText("/api/reports/police-register.csv", { from, to })
  }

  onlinePayments(from: string, to: string): Promise<ApiResult<OnlinePayments>> {
    return this.client.get("/api/payments/online", { from, to })
  }

  checkOnlinePayment(id: string): Promise<ApiResult<OnlineOrder>> {
    return this.client.post(`/api/payments/online/${id}/check`)
  }

  portfolio(): Promise<ApiResult<PortfolioRow[]>> {
    return this.client.get("/api/portfolio")
  }
}

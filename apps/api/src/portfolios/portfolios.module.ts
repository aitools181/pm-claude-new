import { Module } from "@nestjs/common";
import { PortfolioService } from "./portfolio.service.js";
import { PortfoliosController } from "./portfolios.controller.js";

@Module({ controllers: [PortfoliosController], providers: [PortfolioService], exports: [PortfolioService] })
export class PortfoliosModule {}

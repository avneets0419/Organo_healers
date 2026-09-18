import type { Router } from "express";
import { activitiesRouter } from "./modules/activities/activities.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { followupsRouter } from "./modules/followups/followups.routes";
import { messagingRouter } from "./modules/messaging/messaging.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { categoriesRouter, productsRouter } from "./modules/products/products.routes";
import { publicRouter } from "./modules/public/public.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { searchRouter } from "./modules/search/search.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { templatesRouter } from "./modules/templates/templates.routes";
import { usersRouter } from "./modules/users/users.routes";

export const routes = {
  auth: authRouter,
  publicDocs: publicRouter,
  protected: [
    ["/settings", settingsRouter],
    ["/customers", customersRouter],
    ["/products", productsRouter],
    ["/categories", categoriesRouter],
    ["/inventory", inventoryRouter],
    ["/documents", documentsRouter],
    ["/documents", messagingRouter],
    ["/templates", templatesRouter],
    ["/payments", paymentsRouter],
    ["/followups", followupsRouter],
    ["/activities", activitiesRouter],
    ["/search", searchRouter],
    ["/dashboard", dashboardRouter],
    ["/users", usersRouter],
    ["/reports", reportsRouter],
  ] as Array<[string, Router]>,
};

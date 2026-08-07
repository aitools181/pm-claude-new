import { SetMetadata } from "@nestjs/common";
import type { Capability } from "./capabilities.js";
export const PERMISSION_KEY = "required_permission";
export const RequirePermission = (cap: Capability) => SetMetadata(PERMISSION_KEY, cap);

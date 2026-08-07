import { PipeTransform, Injectable } from "@nestjs/common";
import { ZodSchema } from "zod";
import { AppError } from "@pm/shared";

@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new AppError("VALIDATION", "Invalid input", r.error.flatten());
    return r.data;
  }
}

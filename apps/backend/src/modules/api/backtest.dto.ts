import { IsUUID } from "class-validator";

export class StartBacktestDto {
  @IsUUID()
  specId!: string;
}

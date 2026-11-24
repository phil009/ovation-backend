import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, MinLength } from "class-validator";

export class CreateEventDto {
    @ApiProperty({ example: "Anambra day" }) @IsString() @MinLength(2) name: string;
    @ApiProperty({ example: "2026-11-08" }) @IsDateString() date: string;
}

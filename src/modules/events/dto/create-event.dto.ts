import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";

export class CreateEventDto {
    @ApiProperty({ example: "Anambra day", minLength: 2, maxLength: 200 }) @IsString() @MinLength(2) @MaxLength(200) name: string;
    @ApiProperty({ example: "2026-11-08" }) @IsDateString() date: string;
}

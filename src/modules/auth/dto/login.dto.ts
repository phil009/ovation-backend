import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'admin@example.com', maxLength: 254 }) @IsEmail() @MaxLength(254) email: string;
    @ApiProperty({ minLength: 8, maxLength: 128 }) @IsString() @MinLength(8) @MaxLength(128) password: string;
}

export class RegisterDto extends LoginDto {
    @ApiProperty({ example: 'Ngozi Okafor', minLength: 1, maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) name: string;
}

export class ChangePasswordDto {
    @ApiProperty({ maxLength: 128 }) @IsString() @MaxLength(128) currentPassword: string;
    @ApiProperty({ minLength: 8, maxLength: 128 }) @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}

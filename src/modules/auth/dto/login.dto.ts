import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'admin@example.com' }) @IsEmail() @MaxLength(254) email: string;
    @ApiProperty({ minLength: 8, maxLength: 128 }) @IsString() @MinLength(8) @MaxLength(128) password: string;
}

export class RegisterDto extends LoginDto {
    @ApiProperty({ example: 'Ngozi Okafor' }) @IsString() @MinLength(1) @MaxLength(100) name: string;
}

export class ChangePasswordDto {
    @ApiProperty() @IsString() @MaxLength(128) currentPassword: string;
    @ApiProperty({ minLength: 8, maxLength: 128 }) @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}

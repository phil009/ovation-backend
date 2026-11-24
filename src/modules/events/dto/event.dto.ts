import { ApiProperty } from "@nestjs/swagger";

export class EventDto{
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty({ format: 'uuid' }) organizationId: string;
    @ApiProperty() name: string;
    @ApiProperty({ type: String, format: 'date-time' }) date: Date;
    @ApiProperty() closed: boolean;
    @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

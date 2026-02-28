export type EntityType = 'EMAIL' | 'PHONE' | 'AMT' | 'API_KEY' | 'PERSON' | 'ORG';

export interface Detection {
	type: EntityType;
	value: string;
	start: number;
	end: number;
}

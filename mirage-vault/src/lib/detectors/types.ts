export type BuiltinEntityType = 'EMAIL' | 'PHONE' | 'AMT' | 'API_KEY' | 'PERSON' | 'ORG';
export type EntityType = BuiltinEntityType | (string & {});

export interface Detection {
	type: EntityType;
	value: string;
	start: number;
	end: number;
}

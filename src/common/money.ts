// ammounts travel as digit strings of kobo. (1 naira = 100 kobo)

export const KOBO_POSITIVE = /^[1-9]\d{0,17}$/;
export const KOBO_ZERO_OK = /^(0|[1-9]\d{0,17})$/;

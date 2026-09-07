import "server-only";

import {
  normalizeParticipantAccessCode,
  normalizeParticipantCode,
} from "@/app/lib/participant-codes";
import { createDatabase } from "./admin";
import {
  createParticipantSessionToken,
  verifyParticipantSessionToken,
} from "./participant-session-token";

export type ParticipantValidationResult =
  | {
      source: "supabase";
      valid: true;
      participantCode: string;
      participantToken: string;
      participantId: string;
      fallbackReason: null;
      message: string;
    }
  | {
      source: "supabase";
      valid: false;
      participantCode: string;
      participantToken: null;
      participantId: null;
      fallbackReason: null;
      message: string;
    }
  | {
      source: "mock-file-fallback";
      valid: true;
      participantCode: string;
      participantToken: string;
      participantId: null;
      fallbackReason: string;
      message: string;
    };

type ParticipantRow = {
  id: string;
  participant_code: string;
  is_active: boolean;
};

function allowLocalFallback() {
  return process.env.ALLOW_LOCAL_FALLBACK === "true" && process.env.NODE_ENV !== "production";
}

export async function validateParticipantAccessCode(
  accessCode: string,
): Promise<ParticipantValidationResult> {
  const normalizedAccessCode = normalizeParticipantAccessCode(accessCode);

  if (!normalizedAccessCode) {
    return {
      source: "supabase",
      valid: false,
      participantCode: "",
      participantToken: null,
      participantId: null,
      fallbackReason: null,
      message: "Enter your participant access code before continuing.",
    };
  }

  try {
    const supabase = createDatabase();
    const { data, error } = await supabase.execute<ParticipantRow>({ table: "participants", columns: "id, participant_code, is_active", single: "maybeSingle", operation: "select", where: [["access_code", "eq", normalizedAccessCode]] });

    if (error) {
      throw new Error(`Participant lookup failed: ${error.message}`);
    }

    if (!data) {
      return {
        source: "supabase",
        valid: false,
        participantCode: "",
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message:
          "Access code not found. Use the unique access code from your workshop organizer.",
      };
    }

    if (!data.is_active) {
      return {
        source: "supabase",
        valid: false,
        participantCode: data.participant_code,
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message: "This participant access code is inactive. Ask the organizer for help.",
      };
    }

    return {
      source: "supabase",
      valid: true,
      participantCode: data.participant_code,
      participantToken: createParticipantSessionToken(data.participant_code),
      participantId: data.id,
      fallbackReason: null,
      message: "Participant access code validated.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackCode = normalizeParticipantCode(normalizedAccessCode);

    if (!allowLocalFallback()) {
      console.error("[participant-validation] Access-code validation failed", message);

      return {
        source: "supabase",
        valid: false,
        participantCode: "",
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message:
          "Participant validation is temporarily unavailable. Please try again or ask the organizer for help.",
      };
    }

    return {
      source: "mock-file-fallback",
      valid: true,
      participantCode: fallbackCode,
      participantToken: createParticipantSessionToken(fallbackCode),
      participantId: null,
      fallbackReason: message,
      message:
        "Database participant validation is unavailable, so local mock mode accepted this access code.",
    };
  }
}

export async function validateParticipantSession(
  participantCode: string,
  participantToken: string,
): Promise<ParticipantValidationResult> {
  const normalizedCode = normalizeParticipantCode(participantCode);
  const verifiedSession = verifyParticipantSessionToken(participantToken);

  if (!normalizedCode || verifiedSession?.participantCode !== normalizedCode) {
    return {
      source: "supabase",
      valid: false,
      participantCode: normalizedCode,
      participantToken: null,
      participantId: null,
      fallbackReason: null,
      message: "Saved participant session is no longer valid.",
    };
  }

  try {
    const supabase = createDatabase();
    const { data, error } = await supabase.execute<ParticipantRow>({ table: "participants", columns: "id, participant_code, is_active", single: "maybeSingle", operation: "select", where: [["participant_code", "eq", normalizedCode]] });

    if (error) {
      throw new Error(`Participant session lookup failed: ${error.message}`);
    }

    if (!data) {
      return {
        source: "supabase",
        valid: false,
        participantCode: normalizedCode,
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message: "Saved participant is not registered.",
      };
    }

    if (!data.is_active) {
      return {
        source: "supabase",
        valid: false,
        participantCode: normalizedCode,
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message: "This participant is inactive. Ask the organizer for help.",
      };
    }

    return {
      source: "supabase",
      valid: true,
      participantCode: data.participant_code,
      participantToken,
      participantId: data.id,
      fallbackReason: null,
      message: "Participant session validated.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!allowLocalFallback()) {
      console.error("[participant-validation] Session validation failed", message);

      return {
        source: "supabase",
        valid: false,
        participantCode: normalizedCode,
        participantToken: null,
        participantId: null,
        fallbackReason: null,
        message:
          "Participant validation is temporarily unavailable. Please return home and try again, or ask the organizer for help.",
      };
    }

    return {
      source: "mock-file-fallback",
      valid: true,
      participantCode: normalizedCode,
      participantToken,
      participantId: null,
      fallbackReason: message,
      message:
        "Database participant session validation is unavailable, so local mock mode accepted this saved participant.",
    };
  }
}

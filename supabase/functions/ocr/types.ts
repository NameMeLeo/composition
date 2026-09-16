/* Composition — the response contract.

   Two producers fill one contract:

     - the provider path (Tanita's own API) maps a machine payload into the report;
     - the OCR path (Gemini) reads a photographed report into the same sections.

   Both must hand the app a `Report` with identical sections, so that nothing
   downstream needs to know which path filled it. The only section that belongs to
   one path alone is `provider_details`.

   `confidence` and `notes` are deliberately NOT part of `Report`. They describe how
   the extraction went, not what was measured, and the app reads them from the
   response envelope. Keeping them out of the report is what stops the same two
   values from appearing twice, once nested and once at the top. */

export interface ReportMetadata {
  test_date?: string | null;
  facility_name?: string | null;
  serial_number?: string | null;
  device_brand?: string | null;
}

export interface UserProfile {
  age?: number | null;
  gender?: 'M' | 'F' | null;
  gender_code?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  clothing_weight_kg?: number | null;
}

export interface KeyIndicators {
  bmi?: number | null;
  metabolic_age?: number | null;
  visceral_fat_rating?: number | null;
  visceral_fat_status?: string | null;
  sarcopenic_index_smi?: number | null;
  skeletal_muscle_mass_kg?: number | null;
  physique_rating?: string | null;
  physique_rating_score?: number | null;
  muscle_quality_score?: number | null;
  body_type_code?: number | null;
  muscle_score?: number | null;
  body_index?: number | null;
}

export interface BodyComposition {
  fat_percentage?: number | null;
  fat_mass_kg?: number | null;
  muscle_mass_kg?: number | null;
  fat_free_mass_kg?: number | null;
  bone_mass_kg?: number | null;
  protein_mass_kg?: number | null;
  total_body_water_kg?: number | null;
  total_body_water_percent?: number | null;
  intracellular_water_kg?: number | null;
  extracellular_water_kg?: number | null;
  ecw_tbw_ratio_percent?: number | null;
  degree_of_obesity_percent?: number | null;
  muscle_ratio_percent?: number | null;
  bmr_kcal?: number | null;
  bmr_kj?: number | null;
}

/** The five body parts, as a mass in kilograms. */
export interface SegmentMass {
  trunk_kg?: number | null;
  left_arm_kg?: number | null;
  right_arm_kg?: number | null;
  left_leg_kg?: number | null;
  right_leg_kg?: number | null;
}

/** The five body parts, as a fat percentage. */
export interface SegmentPercent {
  trunk_percent?: number | null;
  left_arm_percent?: number | null;
  right_arm_percent?: number | null;
  left_leg_percent?: number | null;
  right_leg_percent?: number | null;
}

/** The five body parts, as a signed provider balance score. */
export interface SegmentScore {
  trunk?: number | null;
  left_arm?: number | null;
  right_arm?: number | null;
  left_leg?: number | null;
  right_leg?: number | null;
}

export interface SegmentalAnalysis {
  muscle_mass?: SegmentMass;
  fat_mass?: SegmentMass;
  fat_percentage?: SegmentPercent;
  muscle_balance_scores?: SegmentScore;
  fat_balance_scores?: SegmentScore;
}

/** A printed standard value with its lower and upper reference bounds. */
export interface ReferenceRange {
  lower?: number | null;
  upper?: number | null;
  standard?: number | null;
}

export interface ReferenceRanges {
  body_fat_percent?: ReferenceRange;
  fat_mass_kg?: ReferenceRange;
  fat_free_mass_kg?: ReferenceRange;
  weight_kg?: ReferenceRange;
  muscle_mass_kg?: ReferenceRange;
}

export interface Assessments {
  water_balance_block?: number | null;
  bmr_block?: number | null;
  visceral_fat_block?: number | null;
  leg_muscle_score?: number | null;
  lower_body_muscle_balance?: number | null;
  upper_body_muscle_balance?: number | null;
}

/** Where a machine-read payload came from. Filled by the provider path only; the
    model is instructed never to produce it. */
export interface ProviderDetails {
  source: string;
  mapping_version?: string;
  raw?: Record<string, unknown>;
}

/** The canonical report. Identical in shape whichever path produced it. */
export interface Report {
  metadata?: ReportMetadata;
  user_profile?: UserProfile;
  key_indicators?: KeyIndicators;
  body_composition?: BodyComposition;
  segmental_analysis?: SegmentalAnalysis;
  reference_ranges?: ReferenceRanges;
  assessments?: Assessments;
  provider_details?: ProviderDetails;
}

/** What the model answers with: the report, plus the two fields that describe the
    extraction itself and are lifted into the envelope before the report is returned. */
export interface Extraction extends Report {
  confidence?: number;
  notes?: string;
}

/** The model's reply before it is split. `measured_at` is a legacy alias the schema
    no longer asks for; it is still honoured so an older model build keeps working. */
export interface RawExtraction extends Extraction {
  measured_at?: string;
}

/** What a successful call answers with. */
export interface OcrResponse {
  ok: true;
  report: Report;
  measuredAt: string | null;
  metrics: Record<string, number>;
  confidence: number | null;
  notes: string;
  sourceType: string;
  /** The model's raw text, kept so the review screen can show what was read. */
  text?: string;
}

/** Everything `callGemini` resolves with — the envelope minus `ok` and `sourceType`,
    which the router adds once it knows which path answered. */
export type ExtractionResponse = Omit<OcrResponse, 'ok' | 'sourceType'>;

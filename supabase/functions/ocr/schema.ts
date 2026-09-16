/* Composition — the JSON the model must answer with.

   This is Gemini's responseSchema, so it describes exactly what the model returns and
   nothing else. It is deliberately NOT the shape of the HTTP response: the router wraps
   the model's answer in an envelope, and `types.ts` is the authority on that envelope.

   How the two line up:

     model returns           router sends to the app
     ------------------      --------------------------------------------
     metadata            ->  report.metadata
     user_profile        ->  report.user_profile
     key_indicators      ->  report.key_indicators
     body_composition    ->  report.body_composition
     segmental_analysis  ->  report.segmental_analysis
     reference_ranges    ->  report.reference_ranges
     assessments         ->  report.assessments
     confidence          ->  confidence        (envelope)
     notes               ->  notes             (envelope)
     (never)             ->  report.provider_details   provider path only
     (never)             ->  metrics / measuredAt / sourceType / ok

   So `confidence` and `notes` are declared here because the model must produce them,
   but they are stripped out of the report before it is returned — that is why they are
   listed last, after the report sections, and why the prompt says the same thing.

   Every section mirrors an interface in `types.ts`. Adding, renaming or removing a
   field here without doing the same to `Report` breaks the contract. */

export type GeminiSchema = Record<string, unknown>;

const REPORT_SECTIONS: GeminiSchema = {
  metadata: {
    type: 'OBJECT',
    description: 'Report metadata and device details. / 報告元數據與儀器資訊。',
    properties: {
      test_date: { type: 'STRING', description: 'Local test date and time, for example 2026-09-14T21:20:09.' },
      facility_name: { type: 'STRING', description: 'Testing facility or organization, if printed.' },
      serial_number: { type: 'STRING', description: 'Device serial number from S/N.' },
      device_brand: { type: 'STRING', description: 'Analyzer brand or manufacturer, if printed.' }
    }
  },
  user_profile: {
    type: 'OBJECT',
    description: 'Subject profile. / 受測者基本資料。',
    properties: {
      age: { type: 'INTEGER', description: 'Age in years.' },
      gender: { type: 'STRING', enum: ['M', 'F'], description: 'Printed gender: M or F.' },
      gender_code: { type: 'INTEGER', description: 'Numeric provider gender code, if printed.' },
      height_cm: { type: 'NUMBER', description: 'Height in centimeters.' },
      weight_kg: { type: 'NUMBER', description: 'Weight in kilograms from the Weight row or summary.' },
      clothing_weight_kg: { type: 'NUMBER', description: 'Clothing weight in kilograms, if printed.' }
    }
  },
  key_indicators: {
    type: 'OBJECT',
    description: 'High-level indicators. / 核心指標。',
    properties: {
      bmi: { type: 'NUMBER', description: 'Body Mass Index.' },
      metabolic_age: { type: 'INTEGER', description: 'Metabolic age in years.' },
      visceral_fat_rating: { type: 'INTEGER', description: 'Numeric Visceral Fat Rating, usually 1-59.' },
      visceral_fat_status: { type: 'STRING', enum: ['Standard', 'High', 'Very High'], description: 'Printed visceral-fat category.' },
      sarcopenic_index_smi: { type: 'NUMBER', description: 'Sarcopenic Index or Skeletal Muscle Mass Index (SMI), in kg/m2.' },
      skeletal_muscle_mass_kg: { type: 'NUMBER', description: 'Skeletal Muscle Mass (SMM), in kg.' },
      physique_rating: { type: 'STRING', description: 'Categorical Physique Rating such as Standard, Muscular, Over Fat, or Hidden Obese.' },
      physique_rating_score: { type: 'NUMBER', description: 'Numeric Physique Rating from 1-9, only if explicitly printed.' },
      muscle_quality_score: { type: 'NUMBER', description: 'Muscle Quality score, if explicitly printed.' },
      body_type_code: { type: 'NUMBER', description: 'Numeric provider body-type code, if printed.' },
      muscle_score: { type: 'NUMBER', description: 'Provider muscle score, if printed.' },
      body_index: { type: 'NUMBER', description: 'Provider body index score, if printed.' }
    }
  },
  body_composition: {
    type: 'OBJECT',
    description: 'Detailed fat, muscle, bone, protein, and water values. / 詳細體成分數據。',
    properties: {
      fat_percentage: { type: 'NUMBER', description: 'Body fat percentage from the Fat row, not Fat Mass.' },
      fat_mass_kg: { type: 'NUMBER', description: 'Fat Mass in kg.' },
      muscle_mass_kg: { type: 'NUMBER', description: 'Total Muscle Mass row in kg; do not use SMM here.' },
      fat_free_mass_kg: { type: 'NUMBER', description: 'Fat-Free Mass (FFM) in kg.' },
      bone_mass_kg: { type: 'NUMBER', description: 'Bone Mass in kg.' },
      protein_mass_kg: { type: 'NUMBER', description: 'Protein mass in kg.' },
      total_body_water_kg: { type: 'NUMBER', description: 'Total Body Water (TBW) in kg.' },
      total_body_water_percent: { type: 'NUMBER', description: 'Total Body Water (TBW) percentage, if printed.' },
      intracellular_water_kg: { type: 'NUMBER', description: 'Intracellular Water (ICW) in kg.' },
      extracellular_water_kg: { type: 'NUMBER', description: 'Extracellular Water (ECW) in kg.' },
      ecw_tbw_ratio_percent: { type: 'NUMBER', description: 'ECW/TBW percentage.' },
      degree_of_obesity_percent: { type: 'NUMBER', description: 'Degree of obesity percentage, if printed.' },
      muscle_ratio_percent: { type: 'NUMBER', description: 'Muscle ratio percentage, if printed.' },
      bmr_kcal: { type: 'INTEGER', description: 'Basal Metabolic Rate in kcal.' },
      bmr_kj: { type: 'INTEGER', description: 'Basal Metabolic Rate in kJ.' }
    }
  },
  segmental_analysis: {
    type: 'OBJECT',
    description: 'Muscle and fat distribution by body segment. / 分部肌肉與脂肪數據。',
    properties: {
      muscle_mass: {
        type: 'OBJECT',
        description: 'Segmental muscle mass in kg.',
        properties: {
          trunk_kg: { type: 'NUMBER', description: 'Trunk muscle mass in kg.' },
          left_arm_kg: { type: 'NUMBER', description: 'Left arm muscle mass in kg.' },
          right_arm_kg: { type: 'NUMBER', description: 'Right arm muscle mass in kg.' },
          left_leg_kg: { type: 'NUMBER', description: 'Left leg muscle mass in kg.' },
          right_leg_kg: { type: 'NUMBER', description: 'Right leg muscle mass in kg.' }
        }
      },
      fat_mass: {
        type: 'OBJECT',
        description: 'Segmental fat mass in kg.',
        properties: {
          trunk_kg: { type: 'NUMBER', description: 'Trunk fat mass in kg.' },
          left_arm_kg: { type: 'NUMBER', description: 'Left arm fat mass in kg.' },
          right_arm_kg: { type: 'NUMBER', description: 'Right arm fat mass in kg.' },
          left_leg_kg: { type: 'NUMBER', description: 'Left leg fat mass in kg.' },
          right_leg_kg: { type: 'NUMBER', description: 'Right leg fat mass in kg.' }
        }
      },
      fat_percentage: {
        type: 'OBJECT',
        description: 'Segmental fat percentage for each body part.',
        properties: {
          trunk_percent: { type: 'NUMBER', description: 'Trunk fat percentage.' },
          left_arm_percent: { type: 'NUMBER', description: 'Left arm fat percentage.' },
          right_arm_percent: { type: 'NUMBER', description: 'Right arm fat percentage.' },
          left_leg_percent: { type: 'NUMBER', description: 'Left leg fat percentage.' },
          right_leg_percent: { type: 'NUMBER', description: 'Right leg fat percentage.' }
        }
      },
      muscle_balance_scores: {
        type: 'OBJECT',
        description: 'Signed provider muscle balance scores by body part.',
        properties: {
          trunk: { type: 'NUMBER', description: 'Trunk muscle balance score.' },
          left_arm: { type: 'NUMBER', description: 'Left arm muscle balance score.' },
          right_arm: { type: 'NUMBER', description: 'Right arm muscle balance score.' },
          left_leg: { type: 'NUMBER', description: 'Left leg muscle balance score.' },
          right_leg: { type: 'NUMBER', description: 'Right leg muscle balance score.' }
        }
      },
      fat_balance_scores: {
        type: 'OBJECT',
        description: 'Signed provider fat balance scores by body part.',
        properties: {
          trunk: { type: 'NUMBER', description: 'Trunk fat balance score.' },
          left_arm: { type: 'NUMBER', description: 'Left arm fat balance score.' },
          right_arm: { type: 'NUMBER', description: 'Right arm fat balance score.' },
          left_leg: { type: 'NUMBER', description: 'Left leg fat balance score.' },
          right_leg: { type: 'NUMBER', description: 'Right leg fat balance score.' }
        }
      }
    }
  },
  reference_ranges: {
    type: 'OBJECT',
    description: 'Printed standard values and lower/upper reference ranges. / 標準值與參考範圍。',
    properties: {
      body_fat_percent: {
        type: 'OBJECT', properties: {
          lower: { type: 'NUMBER', description: 'Lower body-fat reference.' },
          upper: { type: 'NUMBER', description: 'Upper body-fat reference.' },
          standard: { type: 'NUMBER', description: 'Standard body-fat value.' }
        }
      },
      fat_mass_kg: {
        type: 'OBJECT', properties: {
          lower: { type: 'NUMBER', description: 'Lower fat-mass reference in kg.' },
          upper: { type: 'NUMBER', description: 'Upper fat-mass reference in kg.' }
        }
      },
      fat_free_mass_kg: {
        type: 'OBJECT', properties: {
          lower: { type: 'NUMBER', description: 'Lower fat-free-mass reference in kg.' },
          upper: { type: 'NUMBER', description: 'Upper fat-free-mass reference in kg.' }
        }
      },
      weight_kg: {
        type: 'OBJECT', properties: {
          lower: { type: 'NUMBER', description: 'Lower standard-weight reference in kg.' },
          upper: { type: 'NUMBER', description: 'Upper standard-weight reference in kg.' },
          standard: { type: 'NUMBER', description: 'Standard weight in kg.' }
        }
      },
      muscle_mass_kg: {
        type: 'OBJECT', properties: {
          lower: { type: 'NUMBER', description: 'Lower standard-muscle reference in kg.' },
          upper: { type: 'NUMBER', description: 'Upper standard-muscle reference in kg.' },
          standard: { type: 'NUMBER', description: 'Standard muscle mass in kg.' }
        }
      }
    }
  },
  assessments: {
    type: 'OBJECT',
    description: 'Provider assessment and classification values. / 儀器評估與分類值。',
    properties: {
      water_balance_block: { type: 'NUMBER', description: 'Provider water/ECW block code.' },
      bmr_block: { type: 'NUMBER', description: 'Provider BMR block code.' },
      visceral_fat_block: { type: 'NUMBER', description: 'Provider visceral-fat block code.' },
      leg_muscle_score: { type: 'NUMBER', description: 'Leg muscle score.' },
      lower_body_muscle_balance: { type: 'NUMBER', description: 'Lower-body muscle balance code or score.' },
      upper_body_muscle_balance: { type: 'NUMBER', description: 'Upper-body muscle balance code or score.' }
    }
  }
};

/* The two fields that describe the extraction rather than the measurement. They are
   read out of the model's answer and placed in the response envelope; they never
   travel inside `report`. Listed after the sections so the model's output reads
   sections-first, exactly like the response body it becomes. */
const EXTRACTION_METADATA: GeminiSchema = {
  confidence: { type: 'NUMBER', description: 'Overall extraction confidence from 0 to 1. Not a measurement; it is returned beside the report, not inside it.' },
  notes: { type: 'STRING', description: 'Short note naming specific unreadable or ambiguous fields. Not a measurement; it is returned beside the report, not inside it.' }
};

export const RESPONSE_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  description: 'Structured Tanita report extraction. / 身體成分分析報告結構化萃取。',
  properties: Object.assign({}, REPORT_SECTIONS, EXTRACTION_METADATA),
  /* These five sections are the ones the app charts, so an empty object is still an
     answer; the rest are genuinely optional and are omitted when the report has none. */
  required: ['metadata', 'user_profile', 'key_indicators', 'body_composition', 'segmental_analysis']
};

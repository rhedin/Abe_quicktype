import type { RenderContext } from "../../Renderer.js";
import {
    BooleanOption,
    EnumOption,
    getOptionValues,
} from "../../RendererOptions/index.js";
import { AcronymStyleOptions, acronymOption } from "../../support/Acronyms.js";
import { convertersOption } from "../../support/Converters.js";
import {
    JS_SAFE_INTEGER_RANGE,
    type IntegerRange,
} from "../../support/IntegerRange.js";
import { TargetLanguage } from "../../TargetLanguage.js";
import type {
    PrimitiveStringTypeKind,
    TransformedStringTypeKind,
} from "../../Type/index.js";
import type { StringTypeMapping } from "../../Type/TypeBuilderUtils.js";
import type { LanguageName, RendererOptions } from "../../types.js";

import { JavaScriptRenderer } from "./JavaScriptRenderer.js";

export const javaScriptOptions = {
    acronymStyle: acronymOption(AcronymStyleOptions.Pascal),
    runtimeTypecheck: new BooleanOption(
        "runtime-typecheck",
        "Verify JSON.parse results at runtime",
        true,
    ),
    runtimeTypecheckIgnoreUnknownProperties: new BooleanOption(
        "runtime-typecheck-ignore-unknown-properties",
        "Ignore unknown properties when verifying at runtime",
        false,
        "secondary",
    ),
    converters: convertersOption(),
    rawType: new EnumOption(
        "raw-type",
        "Type of raw input (json by default)",
        {
            json: "json",
            any: "any",
        } as const,
        "json",
        "secondary",
    ),
    // NEW: mirrors the `module-system` option already used by the
    // javascript-prop-types target (see JavaScriptPropTypesRenderer.ts).
    // Default is "common-js" so existing output is byte-identical unless
    // a caller explicitly opts in to "es6".
    moduleSystem: new EnumOption(
        "module-system",
        "Which module system to use",
        { "common-js": false, es6: true } as const,
        "common-js",
    ),
};

export const javaScriptLanguageConfig = {
    displayName: "JavaScript",
    names: ["javascript", "js", "jsx"],
    extension: "js",
} as const;

export class JavaScriptTargetLanguage extends TargetLanguage<
    typeof javaScriptLanguageConfig
> {
    public getSupportedIntegerRange(): IntegerRange | null {
        return JS_SAFE_INTEGER_RANGE;
    }

    public constructor() {
        super(javaScriptLanguageConfig);
    }

    public getOptions(): typeof javaScriptOptions {
        return javaScriptOptions;
    }

    public get stringTypeMapping(): StringTypeMapping {
        const mapping: Map<TransformedStringTypeKind, PrimitiveStringTypeKind> =
            new Map();
        const dateTimeType = "date-time";
        mapping.set("date", dateTimeType);
        mapping.set("date-time", dateTimeType);
        mapping.set("uuid", "uuid");
        return mapping;
    }

    public get supportsOptionalClassProperties(): boolean {
        return true;
    }

    public get supportsFullObjectType(): boolean {
        return true;
    }

    protected makeRenderer<Lang extends LanguageName = "javascript">(
        renderContext: RenderContext,
        untypedOptionValues: RendererOptions<Lang>,
    ): JavaScriptRenderer {
        return new JavaScriptRenderer(
            this,
            renderContext,
            getOptionValues(javaScriptOptions, untypedOptionValues),
        );
    }
}

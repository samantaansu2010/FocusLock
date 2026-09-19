"use strict";

(function () {

    const ENGINE_VERSION = 1;

    const MODES = Object.freeze({
        FOCUS: "focus",
        BLOCK: "block"
    });

    const BEHAVIORS = Object.freeze({
        ALLOW_ONLY: "allow-only",
        BLOCK_LIST: "block-list"
    });

    const RULE_TYPES = Object.freeze({
        DOMAIN: "domain",
        URL: "url",
        PATH: "path",
        EXCEPTION: "exception"
    });

    const SCHEDULE_TYPES = Object.freeze({
        MANUAL: "manual",
        ONCE: "once",
        RECURRING: "recurring"
    });

    const DAYS = Object.freeze([
        "sun",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat"
    ]);

    const LIMITS = Object.freeze({
        MAX_PROFILES: 100,
        MAX_POLICIES: 100,
        MAX_RULES: 1000,
        MAX_SCHEDULES: 100,
        MAX_DOMAINS_PER_PROFILE: 500,
        MAX_NAME_LENGTH: 100
    });


    /* =========================================================
       General helpers
       ========================================================= */

    function unique(values) {

        return [
            ...new Set(
                values.filter(
                    value =>
                        typeof value === "string" &&
                        value.trim()
                )
            )
        ];
    }


    function createId(prefix) {

        return (
            prefix +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.random()
                .toString(36)
                .slice(2, 10)
        );
    }


    function cleanName(value, fallback) {

        if (
            typeof value !== "string"
        ) {
            return fallback;
        }

        const name =
            value
                .trim()
                .slice(
                    0,
                    LIMITS.MAX_NAME_LENGTH
                );

        return name || fallback;
    }


    /* =========================================================
       Domain normalization
       ========================================================= */

    function normalizeDomain(value) {

        if (
            typeof value !== "string"
        ) {
            return null;
        }

        let input =
            value.trim().toLowerCase();

        if (!input) {
            return null;
        }

        /*
         * Remove common URL prefixes.
         */
        input =
            input.replace(
                /^https?:\/\//i,
                ""
            );

        input =
            input.replace(
                /^www\./i,
                ""
            );

        /*
         * Remove path/query/fragment.
         *
         * Path rules are handled separately.
         */
        input =
            input.split("/")[0];

        input =
            input.split("?")[0];

        input =
            input.split("#")[0];

        /*
         * Remove surrounding wildcard syntax.
         */
        input =
            input.replace(
                /^\*\./,
                ""
            );

        input =
            input.replace(
                /^\*\*/,
                ""
            );

        input =
            input.replace(
                /\*$/,
                ""
            );

        input =
            input.trim();

        /*
         * Valid hostname characters.
         */
        if (
            !/^[a-z0-9.-]+$/i.test(
                input
            )
        ) {
            return null;
        }

        /*
         * Reject malformed domains.
         */
        if (
            input.startsWith(".") ||
            input.endsWith(".") ||
            input.includes("..") ||
            input.includes("-.") ||
            input.includes(".-")
        ) {
            return null;
        }

        /*
         * Require a real hostname suffix.
         *
         * localhost is intentionally not treated
         * as a normal website rule.
         */
        if (
            !input.includes(".")
        ) {
            return null;
        }

        return input;
    }


    /*
     * Classify a domain-style input.
     *
     * family   = "youtube"
     * domain   = "youtube.com"
     * wildcard = "*.youtube.com"
     */
    function classifyDomainInput(value) {

        if (typeof value !== "string") {
            return null;
        }

        let input = value.trim().toLowerCase();

        if (!input) {
            return null;
        }

        const wildcard =
            input.startsWith("*.");

        if (wildcard) {
            input = input.slice(2);
        }

        input =
            input.replace(/^https?:\/\//i, "")
                .split("/")[0]
                .split("?")[0]
                .split("#")[0]
                .replace(/^www\./i, "")
                .trim();

        if (!input) {
            return null;
        }

        if (!/^[a-z0-9.-]+$/i.test(input)) {
            return null;
        }

        if (
            input.startsWith(".") ||
            input.endsWith(".") ||
            input.includes("..") ||
            input.includes("-.") ||
            input.includes(".-")
        ) {
            return null;
        }

        if (wildcard) {
            if (!input.includes(".")) {
                return null;
            }

            return {
                domain: input,
                scope: "wildcard"
            };
        }

        if (input.includes(".")) {
            return {
                domain: input,
                scope: "domain"
            };
        }

        return {
            domain: input,
            scope: "family"
        };
    }

    /* =========================================================
       URL normalization
       ========================================================= */
       function normalizeUrl(value) {
        if (
            typeof value !== "string"
        ) {
            return null;
        }
    
        const input =
            value.trim();
    
        if (!input) {
            return null;
        }
    
        let candidate =
            input;
    
        /*
         * URL wildcard support.
         *
         * new URL() cannot parse a path ending in "/*".
         * Temporarily remove the "*" before parsing and
         * restore it in the normalized pathname.
         */
        const hasWildcardPath =
            candidate.endsWith("/*");
    
        if (hasWildcardPath) {
            candidate =
                candidate.slice(
                    0,
                    -1
                );
        }
    
        if (
            !/^https?:\/\//i.test(
                candidate
            )
        ) {
            candidate =
                "https://" +
                candidate;
        }
    
        try {
            const url =
                new URL(
                    candidate
                );
    
            if (
                url.protocol !== "http:" &&
                url.protocol !== "https:"
            ) {
                return null;
            }
    
            let pathname =
                url.pathname || "/";
    
            if (hasWildcardPath) {
                pathname += "*";
            }
    
            return {
                protocol:
                    url.protocol,
    
                hostname:
                    url.hostname
                        .toLowerCase(),
    
                pathname,
    
                search:
                    url.search || "",
    
                hash:
                    url.hash || ""
            };
    
        } catch {
            return null;
        }
    }

    /* =========================================================
       Rule normalization
       ========================================================= */

    function normalizeRule(rule) {

        if (
            !rule ||
            typeof rule !== "object"
        ) {
            return null;
        }

        const type =
            Object.values(
                RULE_TYPES
            ).includes(
                rule.type
            )
                ? rule.type
                : null;

        if (!type) {
            return null;
        }

        const action =
            rule.action === "allow"
                ? "allow"
                : "block";

        if (
            type === RULE_TYPES.DOMAIN
        ) {

            const rawValue =
                typeof (
                    rule.domain ||
                    rule.value
                ) === "string"
                    ? (
                        rule.domain ||
                        rule.value
                    ).trim()
                    : "";

            /*
             * Smart domain/path syntax.
             *
             * youtube.com/shorts
             * youtube.com/shorts/*
             *
             * becomes an internal PATH rule.
             */
            const pathMarker =
                rawValue.search(
                    /[/?#]/
                );

            if (
                pathMarker > 0
            ) {

                const domainPart =
                    rawValue
                        .slice(
                            0,
                            pathMarker
                        )
                        .trim();

                let pathPart =
                    rawValue
                        .slice(
                            pathMarker
                        )
                        .trim();

                /*
                 * Query and hash are not part of
                 * path matching.
                 */
                pathPart =
                    pathPart
                        .split("?")[0]
                        .split("#")[0];

                if (
                    !pathPart.startsWith("/")
                ) {
                    pathPart =
                        "/" + pathPart;
                }

                const domain =
                    normalizeDomain(
                        domainPart
                    );

                if (
                    !domain
                ) {
                    return null;
                }

                if (
                    pathPart.length > 2000
                ) {
                    pathPart =
                        pathPart.slice(
                            0,
                            2000
                        );
                }

                return {
                    id:
                        rule.id ||
                        createId("rule"),

                    type:
                        RULE_TYPES.PATH,

                    action,

                    domain,

                    path:
                        pathPart
                };
            }

            const classified =
                classifyDomainInput(
                    rawValue
                );

            if (!classified) {
                return null;
            }

            return {
                id:
                    rule.id ||
                    createId("rule"),

                type,

                action,

                domain:
                    classified.domain,

                scope:
                    classified.scope
            };
        }

        if (
            type === RULE_TYPES.URL
        ) {

            const url =
                normalizeUrl(
                    rule.url ||
                    rule.value
                );

            if (!url) {
                return null;
            }

            return {
                id:
                    rule.id ||
                    createId("rule"),

                type,

                action,

                protocol:
                    url.protocol,

                domain:
                    url.hostname,

                pathname:
                    url.pathname,

                search:
                    url.search
            };
        }


        if (
            type === RULE_TYPES.PATH ||
            type === RULE_TYPES.EXCEPTION
        ) {

            const domain =
                normalizeDomain(
                    rule.domain
                );

            if (!domain) {
                return null;
            }

            let path =
                typeof rule.path === "string"
                    ? rule.path.trim()
                    : "/";

            if (!path.startsWith("/")) {
                path =
                    "/" + path;
            }

            if (
                path.length > 2000
            ) {
                path =
                    path.slice(
                        0,
                        2000
                    );
            }

            return {
                id:
                    rule.id ||
                    createId("rule"),

                type,

                action:
                    type === RULE_TYPES.EXCEPTION
                        ? "allow"
                        : action,

                domain,

                path
            };
        }

        return null;
    }


    function normalizeRules(rules) {

        if (
            !Array.isArray(rules)
        ) {
            return [];
        }

        const result = [];

        for (
            const rule of rules
        ) {

            if (
                result.length >=
                LIMITS.MAX_RULES
            ) {
                break;
            }

            const normalized =
                normalizeRule(
                    rule
                );

            if (normalized) {
                result.push(
                    normalized
                );
            }
        }

        return result;
    }


    /* =========================================================
       Profile normalization
       ========================================================= */

    function normalizeProfile(profile) {

        if (
            !profile ||
            typeof profile !== "object"
        ) {
            return null;
        }

        const domains =
            Array.isArray(
                profile.domains
            )
                ? unique(
                    profile.domains
                        .map(
                            normalizeDomain
                        )
                        .filter(Boolean)
                ).slice(
                    0,
                    LIMITS.MAX_DOMAINS_PER_PROFILE
                )
                : [];

        return {

            id:
                profile.id ||
                createId("profile"),

            name:
                cleanName(
                    profile.name,
                    "New Profile"
                ),

            domains,

            rules:
                normalizeRules(
                    profile.rules
                ),

            enabled:
                profile.enabled !== false
        };
    }


    function normalizeProfiles(profiles) {

        if (
            !Array.isArray(profiles)
        ) {
            return [];
        }

        return profiles
            .slice(
                0,
                LIMITS.MAX_PROFILES
            )
            .map(
                normalizeProfile
            )
            .filter(Boolean);
    }


    /* =========================================================
       Schedule normalization
       ========================================================= */

    function normalizeTime(value) {

        if (
            typeof value !== "string"
        ) {
            return null;
        }

        const match =
            value.match(
                /^([01]\d|2[0-3]):([0-5]\d)$/
            );

        if (!match) {
            return null;
        }

        return value;
    }


    function normalizeDays(days) {

        if (
            !Array.isArray(days)
        ) {
            return [];
        }

        return unique(
            days
                .map(
                    day =>
                        typeof day === "string"
                            ? day.toLowerCase()
                            : ""
                )
                .filter(
                    day =>
                        DAYS.includes(day)
                )
        );
    }


    function normalizeSchedule(schedule) {

        if (
            !schedule ||
            typeof schedule !== "object"
        ) {
            return null;
        }

        const type =
            Object.values(
                SCHEDULE_TYPES
            ).includes(
                schedule.type
            )
                ? schedule.type
                : SCHEDULE_TYPES.MANUAL;


        const result = {

            id:
                schedule.id ||
                createId("schedule"),

            type,

            enabled:
                schedule.enabled !== false,

            startTime:
                normalizeTime(
                    schedule.startTime
                ),

            endTime:
                normalizeTime(
                    schedule.endTime
                ),

            days:
                normalizeDays(
                    schedule.days
                ),

            startAt:
                Number.isFinite(
                    schedule.startAt
                )
                    ? schedule.startAt
                    : null,

            endAt:
                Number.isFinite(
                    schedule.endAt
                )
                    ? schedule.endAt
                    : null
        };


        if (
            type === SCHEDULE_TYPES.RECURRING &&
            result.days.length === 0
        ) {
            result.days =
                DAYS.slice();
        }

        return result;
    }


    function normalizeSchedules(schedules) {

        if (
            !Array.isArray(schedules)
        ) {
            return [];
        }

        return schedules
            .slice(
                0,
                LIMITS.MAX_SCHEDULES
            )
            .map(
                normalizeSchedule
            )
            .filter(Boolean);
    }


    /* =========================================================
       Policy normalization
       ========================================================= */

    function normalizePolicy(policy) {

        if (
            !policy ||
            typeof policy !== "object"
        ) {
            return null;
        }

        const mode =
            policy.mode === MODES.BLOCK
                ? MODES.BLOCK
                : MODES.FOCUS;

        const behavior =
            policy.behavior ===
                BEHAVIORS.BLOCK_LIST
                ? BEHAVIORS.BLOCK_LIST
                : BEHAVIORS.ALLOW_ONLY;

        return {

            id:
                policy.id ||
                createId("policy"),

            name:
                cleanName(
                    policy.name,
                    mode === MODES.FOCUS
                        ? "Focus"
                        : "Block"
                ),

            mode,

            behavior,

            enabled:
                policy.enabled !== false,

            profileId:
                typeof policy.profileId === "string"
                    ? policy.profileId
                    : null,

            rules:
                normalizeRules(
                    policy.rules
                ),

            scheduleId:
                typeof policy.scheduleId === "string"
                    ? policy.scheduleId
                    : null,

            protection:
                normalizeProtection(
                    policy.protection
                )
        };
    }


    function normalizePolicies(policies) {

        if (
            !Array.isArray(policies)
        ) {
            return [];
        }

        return policies
            .slice(
                0,
                LIMITS.MAX_POLICIES
            )
            .map(
                normalizePolicy
            )
            .filter(Boolean);
    }


    /* =========================================================
       Protection
       ========================================================= */

    function normalizeProtection(
        protection
    ) {

        if (
            !protection ||
            typeof protection !== "object"
        ) {
            return {
                options: false,
                general: false,
                addons: false,
                support: false,
                profiles: false,
                debugging: false
            };
        }

        return {

            options:
                protection.options === true,

            general:
                protection.general === true,

            addons:
                protection.addons === true,

            support:
                protection.support === true,

            profiles:
                protection.profiles === true,

            debugging:
                protection.debugging === true
        };
    }


    /* =========================================================
       Default state
       ========================================================= */

    function createDefaultState() {

        return {

            schemaVersion: 5,

            engineVersion:
                ENGINE_VERSION,

            settings: {

                uiMode:
                    "simple"
            },

            active: {

                mode:
                    null,

                policyId:
                    null,

                startedAt:
                    null,

                endsAt:
                    null
            },

            profiles: [],

            policies: [],

            schedules: [],

            rules: []
        };
    }


    /* =========================================================
       State normalization
       ========================================================= */

    function normalizeState(state) {

        const base =
            createDefaultState();

        if (
            !state ||
            typeof state !== "object"
        ) {
            return base;
        }


        const result = {

            ...base,

            ...state
        };


        result.schemaVersion =
            5;

        result.engineVersion =
            ENGINE_VERSION;


        result.settings = {

            ...base.settings,

            ...(state.settings || {}),

            uiMode:
                state.settings?.uiMode ===
                    "advanced"
                    ? "advanced"
                    : "simple"
        };


        result.active = {

            ...base.active,

            ...(state.active || {})
        };


        if (
            result.active.mode !==
                MODES.FOCUS &&
            result.active.mode !==
                MODES.BLOCK
        ) {
            result.active.mode =
                null;
        }


        result.profiles =
            normalizeProfiles(
                state.profiles
            );


        result.policies =
            normalizePolicies(
                state.policies
            );


        result.schedules =
            normalizeSchedules(
                state.schedules
            );


        result.rules =
            normalizeRules(
                state.rules
            );


        return result;
    }


    /* =========================================================
       Domain matching
       ========================================================= */

    function domainMatches(
        hostname,
        domain,
        scope = "domain"
    ) {

        if (
            typeof hostname !== "string" ||
            typeof domain !== "string"
        ) {
            return false;
        }

        const host =
            hostname
                .toLowerCase()
                .replace(
                    /\.$/,
                    ""
                );

        const target =
            domain
                .toLowerCase()
                .replace(
                    /\.$/,
                    ""
                );

        if (
            !host ||
            !target
        ) {
            return false;
        }

        /*
         * Family rule:
         *
         * "youtube" matches any complete hostname
         * label named "youtube".
         *
         * This intentionally does NOT use includes(),
         * so "myyoutube.com" and "notyoutube.com"
         * do not match.
         */
        if (
            scope === "family"
        ) {
            return host
                .split(".")
                .includes(target);
        }

        /*
         * Domain and wildcard rules both represent
         * the domain plus its subdomains.
         *
         * Their TLD remains significant because the
         * normalized target contains it.
         */
        return (
            host === target ||
            host.endsWith(
                "." + target
            )
        );
    }

    /* =========================================================
       Path matching
       ========================================================= */

    function pathMatches(
        pathname,
        rulePath
    ) {

        if (
            typeof pathname !== "string" ||
            typeof rulePath !== "string"
        ) {
            return false;
        }

        const actual =
            pathname || "/";

        let target =
            rulePath.trim();

        if (!target) {
            return false;
        }

        /*
         * A trailing /* means the entire path subtree.
         *
         * /shorts/* matches:
         * /shorts
         * /shorts/
         * /shorts/abc
         *
         * but does not match:
         * /shorts2
         */
        if (target.endsWith("/*")) {
            const base =
                target.slice(
                    0,
                    -2
                ) || "/";

            return (
                actual === base ||
                actual.startsWith(
                    base.endsWith("/")
                        ? base
                        : base + "/"
                )
            );
        }

        /*
         * A normal directory path also matches
         * everything beneath that directory.
         *
         * /shorts matches:
         * /shorts
         * /shorts/
         * /shorts/abc
         *
         * but not:
         * /shorts2
         */
        if (target.endsWith("/")) {
            return (
                actual === target ||
                actual.startsWith(target)
            );
        }

        return (
            actual === target ||
            actual.startsWith(
                target + "/"
            )
        );
    }

    /* =========================================================
       URL rule matching
       ========================================================= */

    function ruleMatchesUrl(
        rule,
        url
    ) {

        if (
            !rule ||
            !url
        ) {
            return false;
        }

        let parsed;

        try {

            parsed =
                url instanceof URL
                    ? url
                    : new URL(
                        url
                    );

        } catch {

            return false;
        }


        if (
            parsed.protocol !== "http:" &&
            parsed.protocol !== "https:"
        ) {
            return false;
        }


        const hostname =
            parsed.hostname
                .toLowerCase();


        /*
         * Domain rule.
         */
        if (
            rule.type ===
            RULE_TYPES.DOMAIN
        ) {

            return domainMatches(
                hostname,
                rule.domain,
                rule.scope
            );
        }


        /*
         * URL rule.
         */
        if (
            rule.type ===
            RULE_TYPES.URL
        ) {

            if (
                !domainMatches(
                    hostname,
                    rule.domain
                )
            ) {
                return false;
            }

            if (
                rule.protocol &&
                rule.protocol !==
                    parsed.protocol
            ) {
                return false;
            }

            if (
                rule.pathname &&
                !pathMatches(
                    parsed.pathname,
                    rule.pathname
                )
            ) {
                return false;
            }

            if (
                rule.search &&
                rule.search !==
                    parsed.search
            ) {
                return false;
            }

            return true;
        }


        /*
         * Path rule.
         */
        if (
            rule.type ===
                RULE_TYPES.PATH ||
            rule.type ===
                RULE_TYPES.EXCEPTION
        ) {

            return (
                domainMatches(
                    hostname,
                    rule.domain
                ) &&
                pathMatches(
                    parsed.pathname,
                    rule.path
                )
            );
        }


        return false;
    }


    /* =========================================================
       Matching rules
       ========================================================= */

    function findMatchingRules(
    rules,
    url
) {

        if (
            !Array.isArray(rules)
        ) {
            return [];
        }

        return rules.filter(
            rule =>
                ruleMatchesUrl(
                    rule,
                    url
                )
        );
    }


    /* =========================================================
       Bulk input
       ========================================================= */

    function parseBulkInput(
        input
    ) {

        if (
            typeof input !== "string"
        ) {
            return [];
        }

        const lines =
            input
                .split(/\r?\n/)
                .map(
                    line =>
                        line.trim()
                )
                .filter(Boolean);


        const results = [];


        for (
            const line of lines
        ) {

            /*
             * Ignore obvious comments.
             */
            if (
                line.startsWith("#")
            ) {
                continue;
            }


            /*
             * A line may contain
             * whitespace-separated entries.
             */
            const parts =
                line
                    .split(/\s+/)
                    .filter(Boolean);


            for (
                const part of parts
            ) {

                if (
                    /^https?:\/\//i.test(
                        part
                    )
                ) {

                    const parsed =
                        normalizeUrl(
                            part
                        );

                    if (parsed) {

                        results.push({

                            type:
                                RULE_TYPES.URL,

                            action:
                                "block",

                            domain:
                                parsed.hostname,

                            pathname:
                                parsed.pathname,

                            search:
                                parsed.search,

                            protocol:
                                parsed.protocol
                        });

                    }

                    continue;
                }


                const domain =
                    normalizeDomain(
                        part
                    );


                if (domain) {

                    results.push({

                        type:
                            RULE_TYPES.DOMAIN,

                        action:
                            "block",

                        domain
                    });
                }
            }
        }


        const seen = new Set();

        return results.filter(rule => {
            const key =
                rule.type === RULE_TYPES.URL
                    ? [
                        rule.type,
                        rule.protocol,
                        rule.domain,
                        rule.pathname,
                        rule.search
                    ].join("|")
                    : [
                        rule.type,
                        rule.domain
                    ].join("|");

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    }


    /* =========================================================
       Public engine
       ========================================================= */

    const FocusLockEngine = {

        version:
            ENGINE_VERSION,

        MODES,

        BEHAVIORS,

        RULE_TYPES,

        SCHEDULE_TYPES,

        DAYS,

        LIMITS,

        unique,

        createId,

        normalizeDomain,

        normalizeUrl,

        normalizeRule,

        normalizeRules,

        normalizeProfile,

        normalizeProfiles,

        normalizeSchedule,

        normalizeSchedules,

        normalizePolicy,

        normalizePolicies,

        normalizeProtection,

        createDefaultState,

        normalizeState,

        domainMatches,

        pathMatches,

        ruleMatchesUrl,

        findMatchingRules,

        parseBulkInput
    };


    globalThis.FocusLockEngine =
        FocusLockEngine;

})();














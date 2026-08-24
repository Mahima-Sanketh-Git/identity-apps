/**
 * Copyright (c) 2025-2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Autocomplete, { AutocompleteRenderInputParams, createFilterOptions } from "@oxygen-ui/react/Autocomplete";
import FormControl from "@oxygen-ui/react/FormControl";
import FormControlLabel from "@oxygen-ui/react/FormControlLabel";
import FormHelperText from "@oxygen-ui/react/FormHelperText";
import Radio from "@oxygen-ui/react/Radio";
import RadioGroup from "@oxygen-ui/react/RadioGroup";
import Stack from "@oxygen-ui/react/Stack";
import TextField from "@oxygen-ui/react/TextField";
import Typography from "@oxygen-ui/react/Typography";
import {
    CommonResourcePropertiesPropsInterface
} from "@wso2is/admin.flow-builder-core.v1/components/resource-property-panel/resource-properties";
import useValidationStatus from "@wso2is/admin.flow-builder-core.v1/hooks/use-validation-status";
import { InputVariants } from "@wso2is/admin.flow-builder-core.v1/models/elements";
import { IdentifiableComponentInterface } from "@wso2is/core/models";
import React, {
    ChangeEvent,
    FunctionComponent,
    HTMLAttributes,
    ReactElement,
    SyntheticEvent,
    useEffect,
    useMemo,
    useState
} from "react";
import OrganizationAttributeConstants from "../../../constants/organization-attribute-constants";
import useRegistrationFlowBuilder from "../../../hooks/use-registration-flow-builder";
import { Attribute, AttributeType, OrganizationAttribute } from "../../../models/attributes";

/**
 * Props interface of {@link FieldExtendedProperties}
 */
type FieldExtendedPropertiesPropsInterface = CommonResourcePropertiesPropsInterface &
    IdentifiableComponentInterface;

/**
 * Default substring matcher for the organization attribute selector.
 */
const orgAttributeFilter: (
    _options: OrganizationAttribute[],
    _state: { inputValue: string }
) => OrganizationAttribute[] = createFilterOptions<OrganizationAttribute>();

/**
* Append a synthetic entry for the typed text when it matches no existing option, so an
* admin can bind an attribute key this organization has not used before.
*/
const filterOrgAttributes = (
    options: OrganizationAttribute[],
    state: { inputValue: string }
): OrganizationAttribute[] => {
    const filtered: OrganizationAttribute[] = orgAttributeFilter(options, state);
    const typedKey: string = state.inputValue.trim();
    const alreadyOffered: boolean = options.some(
        (attribute: OrganizationAttribute) => attribute.claimURI === typedKey
    );

    if (typedKey && !alreadyOffered) {
        filtered.push({ claimURI: typedKey, displayName: typedKey });
    }

    return filtered;
};

/**
 * Extended properties for the field elements.
 *
 * Renders an "Attribute" section with:
 *  - A radio group to choose User Attribute or Organization Attribute.
 *  - An autocomplete for user claims (active when User Attribute is selected).
 *  - An autocomplete for org attributes (active when Organization Attribute is selected).
 *
 * Only one autocomplete is interactive at a time; the other is disabled.
 * Switching types clears the previously selected value.
 *
 * @param props - Props injected to the component.
 * @returns The FieldExtendedProperties component.
 */
const FieldExtendedProperties: FunctionComponent<FieldExtendedPropertiesPropsInterface> = ({
    "data-componentid": componentId = "field-extended-properties",
    resource,
    onChange
}: FieldExtendedPropertiesPropsInterface): ReactElement => {
    const { supportedAttributes: userAttributes } = useRegistrationFlowBuilder();
    const { selectedNotification } = useValidationStatus();

    const [ orgKeyError, setOrgKeyError ] = useState<string>("");

    const [ addedOrgAttribute, setAddedOrgAttribute ] = useState<OrganizationAttribute>(null);

    const [ attributeType, setAttributeType ] = useState<AttributeType>(resource.config.identifierType
        || AttributeType.User);

    /**
     * Update the attribute type state whenever the resource config changes.
     */
    useEffect(()=>{
        if(resource.config.identifierType){
            setAttributeType(resource.config.identifierType);
        }
    }, [ resource.config ]);

    /**
     * Resolve the currently selected user attribute from the resource config.
     */
    const selectedUserAttribute: Attribute = useMemo(() => {
        if (attributeType !== AttributeType.User) return null;

        return userAttributes?.find(
            (attribute: Attribute) => attribute?.claimURI === resource.config.identifier
        ) || null;
    }, [ resource.config.identifier, userAttributes, attributeType ]);

    /**
     * The custom organization attribute currently bound to this field, if any.
     *
     * Derived from the saved config rather than held in state: whenever the identifier is an
     * organization attribute that is not one of the core ones, it must be a custom key. This
     * keeps the option list in step with the flow definition on every render — including the
     * first render after reopening a saved flow — so no separate rehydration step is needed.
     */
    const boundOrgAttribute: OrganizationAttribute = useMemo(() => {
        const identifier: string = resource.config.identifier;

        if (attributeType !== AttributeType.Organization || !identifier) {
            return null;
        }

        const isCore: boolean = OrganizationAttributeConstants.CORE_ATTRIBUTES.some(
            (attribute: OrganizationAttribute) => attribute.claimURI === identifier
        );

        if (isCore || !OrganizationAttributeConstants.KEY_PATTERN.test(identifier)) {
            return null;
        }

        return { claimURI: identifier, displayName: identifier };
    }, [ resource.config.identifier, attributeType ]);

    /**
     * Options offered by the organization attribute selector: the core attributes, the key added
     * while this panel has been open, and the key the saved flow already binds. Deduplicated by
     * `claimURI`, so a key that is both added and bound is offered once.
     */
    const orgAttributes: OrganizationAttribute[] = useMemo(() => {
        const options: OrganizationAttribute[] = [ ...OrganizationAttributeConstants.CORE_ATTRIBUTES ];

        [ addedOrgAttribute, boundOrgAttribute ].forEach((attribute: OrganizationAttribute) => {
            if (attribute
                && !options.some((option: OrganizationAttribute) => option.claimURI === attribute.claimURI)) {
                options.push(attribute);
            }
        });

        return options;
    }, [ addedOrgAttribute, boundOrgAttribute ]);

    /**
     * Resolve the currently selected org attribute from the resource config.
     */
    const selectedOrgAttribute: OrganizationAttribute = useMemo(() => {
        if (attributeType !== AttributeType.Organization) return null;

        return orgAttributes.find(
            (attribute: OrganizationAttribute) => attribute?.claimURI === resource.config.identifier
        ) || null;
    }, [ resource.config.identifier, attributeType, orgAttributes ]);

    /**
     * Get the validation error message for the identifier field.
     */
    const errorMessage: string = useMemo(() => {
        const key: string = `${resource?.id}_identifier`;

        if (selectedNotification?.hasResourceFieldNotification(key)) {
            return selectedNotification?.getResourceFieldNotification(key);
        }

        return "";
    }, [ resource, selectedNotification ]);

    /**
     * Write the whole `config` object in a single `onChange` call.
     *
     * `handlePropertyChange` in the core panel is debounced on a shared 300ms timer, so two
     * `onChange` calls fired from one event handler collapse into one and the first is lost.
     * Merging the changes here and writing them under the `config` key keeps every field in
     * step. Keys set to `undefined` are deleted so no empty property survives in the flow JSON.
     *
     * @param changes - Config fields to add, overwrite, or (when `undefined`) remove.
     */
    const updateConfig = (changes: Record<string, unknown>): void => {
        const updated: Record<string, unknown> = { ...resource.config, ...changes };

        Object.keys(updated).forEach((key: string) => {
            if (updated[key] === undefined) {
                delete updated[key];
            }
        });

        onChange("config", updated, resource);
    };

    /**
     * Bind an organization attribute key to the field.
     *
     * Receives an option object when a row is picked, and a raw string when the admin types a
     * key and presses Enter without picking one — `freeSolo` allows submitting text that was
     * never an option, so both shapes must be handled.
     */
    const handleOrgAttributeChange = (
        _: SyntheticEvent,
        value: OrganizationAttribute | string
    ): void => {
        if (value === null) {
            setOrgKeyError("");
            updateConfig({ identifier: "", identifierType: undefined });

            return;
        }

        const key: string = typeof value === "string" ? value.trim() : value.claimURI;

        if (!OrganizationAttributeConstants.KEY_PATTERN.test(key)) {
            setOrgKeyError(
                "Attribute key must start with a letter and contain only letters, numbers or underscores."
            );

            return;
        }

        setOrgKeyError("");

        // Remember the key on both paths: picking the `Add "…"` row hands this handler an option
        // object, while typing and committing hands it a raw string. Core keys are already in the
        // option list, so storing one would render it twice.
        const isCore: boolean = OrganizationAttributeConstants.CORE_ATTRIBUTES.some(
            (attribute: OrganizationAttribute) => attribute.claimURI === key
        );

        if (!isCore) {
            setAddedOrgAttribute({ claimURI: key, displayName: key });
        }

        updateConfig({ identifier: key, identifierType: AttributeType.Organization });
    };

    /**
     * Handle attribute type radio change.
     * Clears the currently stored identifier whenever the type is switched.
     */
    const handleAttributeTypeChange = (_: ChangeEvent<HTMLInputElement>, value: string): void => {
        setAttributeType(value as AttributeType);
        setOrgKeyError("");

        // Branch on the incoming value rather than `attributeType`: the state setter above is
        // asynchronous, so `attributeType` still holds the previous type at this point.
        updateConfig({
            identifier: "",
            identifierType: value === AttributeType.Organization ? AttributeType.Organization : undefined
        });
    };

    if (resource.variant === InputVariants.Password || resource.variant === InputVariants.OrgHandler) {
        return null;
    }

    return (
        <Stack spacing={1} data-componentid={componentId}>

            <Typography variant="body1" fontWeight={400}>
                Attribute
            </Typography>

            <FormControl>
                <RadioGroup
                    value={attributeType}
                    onChange={handleAttributeTypeChange}
                >
                    <Stack>
                        <FormControlLabel
                            value={AttributeType.User}
                            control={<Radio size="small" />}
                            label="User Attribute"

                        />
                        <Autocomplete
                            disablePortal
                            disabled={attributeType !== AttributeType.User}
                            key={`${resource.id}-user`}
                            options={userAttributes || []}
                            getOptionLabel={(attribute: Attribute) => attribute?.displayName ?? ""}
                            sx={{ width: "100%" }}
                            renderInput={(params: AutocompleteRenderInputParams) => (
                                <TextField
                                    {...params}
                                    placeholder={ "Select an attribute" }
                                    error={attributeType === AttributeType.User && !!errorMessage}
                                />
                            )}
                            value={selectedUserAttribute}
                            onChange={(_: SyntheticEvent, attribute: Attribute) => {
                                updateConfig({
                                    identifier: attribute === null ? "" : attribute?.claimURI,
                                    identifierType: undefined
                                });
                            }}
                        />
                    </Stack>
                    <Stack>
                        <FormControlLabel
                            value={AttributeType.Organization}
                            control={<Radio size="small" />}
                            label="Organization Attribute"
                        />
                        <Autocomplete
                            disablePortal
                            freeSolo
                            selectOnFocus
                            handleHomeEndKeys
                            autoSelect
                            clearOnBlur
                            disabled={attributeType !== AttributeType.Organization}
                            key={`${resource.id}-org`}
                            options={orgAttributes}
                            filterOptions={filterOrgAttributes}
                            getOptionLabel={(attribute: OrganizationAttribute | string) =>
                                (typeof attribute === "string" ? attribute : attribute?.displayName ?? "")}
                            renderOption={(props: HTMLAttributes<HTMLLIElement>, attribute: OrganizationAttribute) => {
                                const isExistingOption: boolean = orgAttributes.some(
                                    (option: OrganizationAttribute) => option.claimURI === attribute.claimURI
                                );

                                return (
                                    <li {...props} key={attribute.claimURI}>
                                        {isExistingOption
                                            ? attribute.displayName
                                            : `Add "${attribute.claimURI}"`}
                                    </li>
                                );
                            }}
                            sx={{ width: "100%" }}
                            renderInput={(params: AutocompleteRenderInputParams) => (
                                <TextField
                                    {...params}
                                    placeholder={ "Select or add an attribute" }
                                    error={attributeType === AttributeType.Organization
                                        && (!!errorMessage || !!orgKeyError)}
                                />
                            )}
                            value={selectedOrgAttribute}
                            onChange={handleOrgAttributeChange}
                        />
                    </Stack>
                </RadioGroup>
            </FormControl>

            {(errorMessage || orgKeyError) && (
                <FormHelperText error>
                    {errorMessage || orgKeyError}
                </FormHelperText>
            )}

        </Stack>
    );
};

export default FieldExtendedProperties;

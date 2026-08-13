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

import Autocomplete, { AutocompleteRenderInputParams } from "@oxygen-ui/react/Autocomplete";
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
import React, { ChangeEvent, FunctionComponent, ReactElement, useEffect, useMemo, useState } from "react";
import useRegistrationFlowBuilder from "../../../hooks/use-registration-flow-builder";
import { Attribute, AttributeType, OrganizationAttribute } from "../../../models/attributes";
import { useGetOrganizationAttributes } from "../../../../admin.organizations.v1/api";

/**
 * Props interface of {@link FieldExtendedProperties}
 */
type FieldExtendedPropertiesPropsInterface = CommonResourcePropertiesPropsInterface &
    IdentifiableComponentInterface;

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
    const { data: orgAttributes, isLoading: isOrgAttributesLoading } = useGetOrganizationAttributes();
    const { selectedNotification } = useValidationStatus();

    /**
     * Default attribute type is always USER on mount.
     */
    const [ attributeType, setAttributeType ] = useState<AttributeType>(resource.config.identifierType
        || AttributeType.User);

    /**
     * Update the attribute type state whenever the resource config changes.
     */
    useEffect(()=>{
        if(resource.config.identifierType){
            setAttributeType(resource.config.identifierType);
        }
    }, [ resource.config.identifierType ]);

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
     * Resolve the currently selected org attribute from the resource config.
     */
    const selectedOrgAttribute: OrganizationAttribute = useMemo(() => {
        if (attributeType !== AttributeType.Organization) return null;

        return orgAttributes?.find(
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
     * Handle attribute type radio change.
     * Clears the currently stored identifier whenever the type is switched.
     */
    const handleAttributeTypeChange = (_: ChangeEvent<HTMLInputElement>, value: string): void => {
        setAttributeType(value as AttributeType);
        // Clear the selected attribute value.
        onChange("config.identifier", "", resource);
        onChange("config.identifierType", value, resource);
    };

    if (resource.variant === InputVariants.Password) {
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
                            onChange={(_: ChangeEvent<HTMLInputElement>, attribute: Attribute) => {
                                onChange("config.identifier", attribute === null ? "" : attribute?.claimURI, resource);
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
                            disabled={attributeType !== AttributeType.Organization}
                            key={`${resource.id}-org`}
                            options={orgAttributes || []}
                            loading={isOrgAttributesLoading}
                            getOptionLabel={(attribute: OrganizationAttribute) => attribute?.displayName ?? ""}
                            sx={{ width: "100%" }}
                            renderInput={(params: AutocompleteRenderInputParams) => (
                                <TextField
                                    {...params}
                                    placeholder={ "Select an attribute" }
                                    error={attributeType === AttributeType.Organization && !!errorMessage}
                                />
                            )}
                            value={selectedOrgAttribute}
                            onChange={(_: ChangeEvent<HTMLInputElement>, attribute: OrganizationAttribute | null) => {
                                onChange("config.identifier", attribute?.claimURI, resource);
                            }}
                        />
                    </Stack>
                </RadioGroup>
            </FormControl>

            {errorMessage && (
                <FormHelperText error>
                    {errorMessage}
                </FormHelperText>
            )}

        </Stack>
    );
};

export default FieldExtendedProperties;

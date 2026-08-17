/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

/**
 * Represents a single supported organization attribute returned by the
 * `/organizations/attributes` endpoint. This covers both core schema fields
 * and custom meta-attributes.
 */
export interface SupportedOrganizationAttribute {
    /**
     * Unique attribute identifier (e.g. "organizationName").
     */
    id?: string;
    /**
     * Unique attribute URI or key.
     */
    claimURI?: string;
    /**
     * Human-readable display name of the attribute.
     */
    displayName?: string;
    /**
     * Description of the attribute.
     */
    description?: string;
    /**
     * Whether the attribute is a required field.
     */
    required?: boolean;
    /**
     * The data type of the attribute value (e.g. "STRING", "BOOLEAN").
     */
    dataType?: string;
    /**
     * Category type of attribute ("CORE" or "CUSTOM").
     */
    type?: string;
    /**
     * Whether this is a core (built-in) schema attribute or a custom meta-attribute.
     */
    isCustom?: boolean;
}

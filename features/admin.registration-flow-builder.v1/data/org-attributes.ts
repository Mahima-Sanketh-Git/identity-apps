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

import { Attribute } from "../models/attributes";

/**
 * Static list of organization-level attributes for Phase 1.
 *
 * @remarks
 * These are well-known org properties served by the organization entity (not the user profile).
 * A dynamic API-backed hook (`useGetOrgAttributes`) will replace this in a future phase once
 * the backend endpoint is confirmed.
 */
export const ORGANIZATION_ATTRIBUTES: Attribute[] = [
    {
        claimURI: "organizationName",
        displayName: "Organization Name"
    } as Attribute,
    {
        claimURI: "organizationDescription",
        displayName: "Organization Description"
    } as Attribute
];


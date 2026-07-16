<%--
  ~ Copyright (c) 2025-2026, WSO2 LLC. (https://www.wso2.com).
  ~
  ~ WSO2 LLC. licenses this file to you under the Apache License,
  ~ Version 2.0 (the "License"); you may not use this file except
  ~ in compliance with the License.
  ~ You may obtain a copy of the License at
  ~
  ~    http://www.apache.org/licenses/LICENSE-2.0
  ~
  ~ Unless required by applicable law or agreed to in writing,
  ~ software distributed under the License is distributed on an
  ~ "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  ~ KIND, either express or implied.  See the License for the
  ~ specific language governing permissions and limitations
  ~ under the License.
--%>

<%@ page contentType="application/json;charset=UTF-8" language="java" %>
<%@ page import="java.net.*, java.io.*" %>
<%@ page import="java.util.Base64" %>
<%@ page import="org.apache.commons.lang.StringUtils" %>
<%@include file="../includes/init-url.jsp" %>

<%
    StringBuilder requestBody = new StringBuilder();
    String line;

    try (BufferedReader reader = request.getReader()) {
        while ((line = reader.readLine()) != null) {
            requestBody.append(line);
        }

        String checkHandleUrl = identityServerEndpointContextParam
            + "/api/server/v1/organizations/check-handle";

        URL url = new URL(checkHandleUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");

        // The organization check-handle server API requires an authenticated principal, but this
        // proxy runs in the anonymous onboarding/self-registration flow where no user is logged in.
        // For the POC we authenticate server-side with configured app credentials (Basic auth).
        // Credentials come from context init-params, falling back to admin/admin for local runs.
        // NOTE: this call is server-side only, so credentials are never exposed to the browser.
        String checkHandleUsername = application.getInitParameter("OrgHandleCheckUsername");
        String checkHandlePassword = application.getInitParameter("OrgHandleCheckPassword");
        if (StringUtils.isBlank(checkHandleUsername)) {
            checkHandleUsername = "admin";
        }
        if (StringUtils.isBlank(checkHandlePassword)) {
            checkHandlePassword = "admin";
        }
        String basicAuthCredentials = Base64.getEncoder().encodeToString(
            (checkHandleUsername + ":" + checkHandlePassword).getBytes("utf-8"));
        conn.setRequestProperty("Authorization", "Basic " + basicAuthCredentials);

        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = requestBody.toString().getBytes("utf-8");
            os.write(input, 0, input.length);
        }

        int responseCode = conn.getResponseCode();
        InputStream responseStream = (responseCode >= 200 && responseCode < 300)
            ? conn.getInputStream()
            : conn.getErrorStream();

        StringBuilder responseBody = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(responseStream, "utf-8"))) {
            String responseLine;
            while ((responseLine = br.readLine()) != null) {
                responseBody.append(responseLine.trim());
            }
        }

        response.setStatus(responseCode);
        out.print(responseBody.toString());

    } catch (Exception e) {
        response.setStatus(500);
        out.print("{\"error\": \"Exception: " + e.getMessage() + "\"}");
    }
%>

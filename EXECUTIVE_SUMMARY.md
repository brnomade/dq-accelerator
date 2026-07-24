The Data Quality Accelerator is a browser-based metadata management tool built by Cognizant for the Ministry of Justice Data Management practice.

Its purpose is to support MoJ's five-stage Data Quality Framework — from identifying and prioritising Critical Data Elements (CDEs), through profiling, rule definition, tolerance setting, and monitoring — by giving data stewards a structured, accessible front-end for managing all the metadata that underpins that process.

What it does

It allows data stewards to register and manage the fields that matter most to their agency (CDEs), define and allocate data quality rules to those fields, record accountability (who owns and stewards each data set), profile fields to understand their current data shape, and assess criticality. It also provides a RAG simulator to model how quality scores would behave under different weight configurations, and a coverage matrix showing which CDEs have rules defined across which quality dimensions.

The AI-assisted Data Rule Generator takes a steward-selected CDE with profiling data, builds a structured prompt from it, and sends it to Claude or Copilot. The AI returns fully-formed Athena SQL rules in a structured format that the app parses directly into rule cards — from which the steward can create and allocate rules in one click, without leaving the application.

Who uses it and how

The tool is designed for data stewards working across MoJ's agencies — HMPPS, HMCTS, and MoJ Digital. It operates in a distributed model: each steward works from their own local copy, contributing changes back to a master copy via a delta sync mechanism. A designated master steward (identified by a convention in the stewardship data itself) controls the master copy, reviews and merges contributions, and publishes updated master files for stewards to sync from.

Why it was built this way

The single most important constraint was deployability without IT infrastructure changes. The entire application is one HTML file that runs in any modern browser and can be hosted on SharePoint. There is no server, no database, no installation, and no IT involvement needed to deploy or update it. This makes it immediately usable within MoJ's existing environment while a more permanent backend solution (SharePoint Lists via Microsoft Graph API) is planned for a later phase.
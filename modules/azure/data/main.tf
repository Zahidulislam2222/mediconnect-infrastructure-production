resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# Auto-created by Azure — imported to prevent drift
resource "azurerm_resource_group" "network_watcher_rg" {
  name     = "NetworkWatcherRG"
  location = var.location
}

resource "azurerm_network_watcher" "eastus" {
  name                = "NetworkWatcher_eastus"
  location            = var.location
  resource_group_name = azurerm_resource_group.network_watcher_rg.name
}

resource "azurerm_cosmosdb_account" "db" {
  name                = "mediconnect-cosmos-db"
  location            = var.location
  resource_group_name = azurerm_resource_group.rg.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  automatic_failover_enabled = true

  # Finding #4: Free tier disabled — production should not use free tier (throttling limits)
  free_tier_enabled = false

  # Finding #5: BoundedStaleness recommended for healthcare (stronger consistency than Session)
  consistency_policy {
    consistency_level       = "BoundedStaleness"
    max_interval_in_seconds = 5
    max_staleness_prefix    = 100
  }

  # Primary region
  geo_location {
    location          = var.location
    failover_priority = 0
  }

  # Finding #2: EU geo-replication for GDPR + high availability
  geo_location {
    location          = "West Europe"
    failover_priority = 1
  }

  is_virtual_network_filter_enabled = false

  # Finding #3: Disable public access — use private endpoints or VNet rules
  public_network_access_enabled = false

  # Finding #6: Continuous backup for healthcare data (point-in-time restore)
  backup {
    type = "Continuous"
    tier = "Continuous7Days"
  }

  tags = {
    Project     = "MediConnect"
    Environment = "prod"
    ManagedBy   = "Terraform"
  }
}

# Finding #1: Create database + container so Cosmos DB is not empty
resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "mediconnect-db"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db.name
}

resource "azurerm_cosmosdb_sql_container" "patients" {
  name                = "patients"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/patientId"]

  default_ttl = -1 # No expiration

  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/*"
    }
  }
}

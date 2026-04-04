locals {
  # Collect all attribute definitions needed for each table
  table_attributes = {
    for name, config in var.tables : name => concat(
      # Hash key
      [{ name = config.hash_key, type = config.hash_key_type }],
      # Range key (if present)
      config.range_key != null ? [{ name = config.range_key, type = config.range_key_type }] : [],
      # GSI keys
      flatten([
        for gsi in config.global_secondary_indexes : concat(
          [{ name = gsi.hash_key, type = gsi.hash_key_type }],
          gsi.range_key != null ? [{ name = gsi.range_key, type = gsi.range_key_type }] : []
        )
      ])
    )
  }

  # Deduplicate attributes by name (... groups duplicates, then take first)
  table_unique_attributes = {
    for name, attrs in local.table_attributes : name => [
      for attr_name, attr_list in {
        for attr in attrs : attr.name => attr...
      } : attr_list[0]
    ]
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each = var.tables

  name         = each.key
  billing_mode = each.value.billing_mode
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  deletion_protection_enabled = each.value.deletion_protection

  dynamic "attribute" {
    for_each = local.table_unique_attributes[each.key]
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.global_secondary_indexes
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = global_secondary_index.value.range_key
      projection_type = global_secondary_index.value.projection_type
      non_key_attributes = global_secondary_index.value.projection_type == "INCLUDE" ? global_secondary_index.value.non_key_attributes : null
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl_enabled ? [1] : []
    content {
      enabled        = true
      attribute_name = each.value.ttl_attribute
    }
  }

  point_in_time_recovery {
    enabled = each.value.point_in_time_recovery
  }

  stream_enabled   = each.value.stream_enabled
  stream_view_type = each.value.stream_enabled ? each.value.stream_view_type : null

  tags = each.value.tags

  lifecycle {
    ignore_changes = [
      read_capacity,
      write_capacity,
    ]
  }
}

#!/usr/bin/env node
/**
 * Export Family Tree Script
 * 
 * This script exports the family tree data from Supabase PostgreSQL
 * to a static JSON file for public consumption.
 * 
 * Features:
 * - Deterministic node ordering (by id)
 * - Normalized edges (parent before spouse, sorted by from+to)
 * - Schema validation before write
 * - Auto-updates meta.exportedAt and increments meta.version
 * - Versioned snapshots (family-tree-v1.json, etc.)
 * - Removes unused/internal fields
 * 
 * Usage:
 *   node scripts/export-family-tree.js
 * 
 * Environment:
 *   DATABASE_URL - Supabase PostgreSQL connection string
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Output paths
const FRONTEND_PUBLIC = path.resolve(__dirname, '../../frontend/public');
const OUTPUT_FILE = path.join(FRONTEND_PUBLIC, 'family-tree.json');

// JSON Schema for validation
const TREE_SCHEMA = {
  requiredMetaFields: ['familyName', 'exportedAt', 'version'],
  requiredNodeFields: ['id', 'name', 'gender'],
  requiredEdgeFields: ['from', 'to', 'type'],
  validGenders: ['male', 'female'],
  validEdgeTypes: ['spouse', 'parent'],
};

/**
 * Validate the exported tree against schema
 */
function validateTree(tree) {
  const errors = [];

  // Validate meta
  for (const field of TREE_SCHEMA.requiredMetaFields) {
    if (tree.meta[field] === undefined) {
      errors.push(`Missing meta field: ${field}`);
    }
  }

  // Validate nodes
  const nodeIds = new Set();
  tree.nodes.forEach((node, index) => {
    for (const field of TREE_SCHEMA.requiredNodeFields) {
      if (node[field] === undefined) {
        errors.push(`Node ${index}: missing field ${field}`);
      }
    }
    if (node.gender && !TREE_SCHEMA.validGenders.includes(node.gender)) {
      errors.push(`Node ${index}: invalid gender ${node.gender}`);
    }
    if (node.id) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }
  });

  // Validate edges
  tree.edges.forEach((edge, index) => {
    for (const field of TREE_SCHEMA.requiredEdgeFields) {
      if (edge[field] === undefined) {
        errors.push(`Edge ${index}: missing field ${field}`);
      }
    }
    if (edge.type && !TREE_SCHEMA.validEdgeTypes.includes(edge.type)) {
      errors.push(`Edge ${index}: invalid type ${edge.type}`);
    }
    if (edge.from && !nodeIds.has(edge.from)) {
      errors.push(`Edge ${index}: 'from' references non-existent node ${edge.from}`);
    }
    if (edge.to && !nodeIds.has(edge.to)) {
      errors.push(`Edge ${index}: 'to' references non-existent node ${edge.to}`);
    }
  });

  return errors;
}

/**
 * Get the current version from existing file
 */
function getCurrentVersion() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      return existing.meta?.version || 0;
    }
  } catch (err) {
    console.warn('Could not read existing version, starting at 1');
  }
  return 0;
}

/**
 * Fetch all family members from database
 */
async function fetchMembers(client) {
  const query = `
    SELECT 
      id,
      full_name,
      gender,
      birth_year,
      death_year,
      father_id,
      mother_id
    FROM family_members
    ORDER BY id ASC
  `;
  const { rows } = await client.query(query);
  return rows;
}

/**
 * Fetch all marriages from database
 */
async function fetchMarriages(client) {
  const query = `
    SELECT 
      husband_id,
      wife_id
    FROM marriages
    ORDER BY husband_id ASC, wife_id ASC
  `;
  const { rows } = await client.query(query);
  return rows;
}

/**
 * Convert database records to tree format
 */
function convertToTreeFormat(members, marriages) {
  const nodes = [];
  const edges = [];
  const memberIds = new Set(members.map(m => m.id));

  // Convert members to nodes
  for (const member of members) {
    const node = {
      id: String(member.id),
      name: member.full_name,
      gender: member.gender || 'male',
    };

    // Only include optional fields if they have values
    if (member.birth_year) {
      node.birthYear = member.birth_year;
    }
    if (member.death_year) {
      node.deathYear = member.death_year;
    }

    nodes.push(node);
  }

  // Sort nodes by id for deterministic output
  nodes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Add parent edges
  for (const member of members) {
    if (member.father_id && memberIds.has(member.father_id)) {
      edges.push({
        from: String(member.father_id),
        to: String(member.id),
        type: 'parent',
      });
    }
    if (member.mother_id && memberIds.has(member.mother_id)) {
      edges.push({
        from: String(member.mother_id),
        to: String(member.id),
        type: 'parent',
      });
    }
  }

  // Add spouse edges from marriages
  for (const marriage of marriages) {
    if (memberIds.has(marriage.husband_id) && memberIds.has(marriage.wife_id)) {
      edges.push({
        from: String(marriage.husband_id),
        to: String(marriage.wife_id),
        type: 'spouse',
      });
    }
  }

  // Sort edges: parent first, then spouse, then by from+to
  edges.sort((a, b) => {
    const typeOrder = { parent: 0, spouse: 1 };
    const typeA = typeOrder[a.type] ?? 2;
    const typeB = typeOrder[b.type] ?? 2;
    if (typeA !== typeB) return typeA - typeB;
    if (a.from !== b.from) return a.from.localeCompare(b.from, undefined, { numeric: true });
    return a.to.localeCompare(b.to, undefined, { numeric: true });
  });

  return { nodes, edges };
}

/**
 * Save versioned snapshot
 */
function saveVersionedSnapshot(tree, version) {
  const snapshotFile = path.join(FRONTEND_PUBLIC, `family-tree-v${version}.json`);
  fs.writeFileSync(snapshotFile, JSON.stringify(tree, null, 2), 'utf8');
  console.log(`📸 Saved versioned snapshot: family-tree-v${version}.json`);
  return snapshotFile;
}

/**
 * Main export function
 */
async function exportFamilyTree() {
  console.log('🌳 Starting family tree export...\n');
  
  const client = await pool.connect();
  
  try {
    // Fetch data
    console.log('📊 Fetching members...');
    const members = await fetchMembers(client);
    console.log(`   Found ${members.length} members`);

    console.log('💍 Fetching marriages...');
    const marriages = await fetchMarriages(client);
    console.log(`   Found ${marriages.length} marriages`);

    if (members.length === 0) {
      throw new Error('No family members found in database. Please add data first.');
    }

    // Convert to tree format
    console.log('\n🔄 Converting to tree format...');
    const { nodes, edges } = convertToTreeFormat(members, marriages);
    console.log(`   Generated ${nodes.length} nodes and ${edges.length} edges`);

    // Build tree object
    const currentVersion = getCurrentVersion();
    const newVersion = currentVersion + 1;
    const now = new Date().toISOString();

    const tree = {
      meta: {
        familyName: 'Bhuiyans',
        exportedAt: now,
        version: newVersion,
      },
      nodes,
      edges,
    };

    // Validate
    console.log('\n✅ Validating tree schema...');
    const errors = validateTree(tree);
    if (errors.length > 0) {
      console.error('❌ Validation errors:');
      errors.forEach(err => console.error(`   - ${err}`));
      throw new Error('Tree validation failed. Fix the errors and try again.');
    }
    console.log('   Schema is valid');

    // Save versioned snapshot
    console.log('\n💾 Saving files...');
    saveVersionedSnapshot(tree, newVersion);

    // Save main file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tree, null, 2), 'utf8');
    console.log(`📄 Saved main file: family-tree.json`);

    console.log('\n🎉 Export complete!');
    console.log(`   Version: ${newVersion}`);
    console.log(`   Exported at: ${now}`);
    console.log(`   Nodes: ${nodes.length}`);
    console.log(`   Edges: ${edges.length}`);

    return {
      success: true,
      version: newVersion,
      exportedAt: now,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };

  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// If run directly
if (require.main === module) {
  exportFamilyTree()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { exportFamilyTree };
